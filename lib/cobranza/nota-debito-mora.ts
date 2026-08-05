/**
 * lib/cobranza/nota-debito-mora.ts — Genera una Nota de Débito (tipo 33) por mora.
 *
 * ARQUITECTURA: el recargo por mora ya NO se guarda como dato oculto en
 * `recargos_mora`. En su lugar se crea una ND tipo 33 en estado BORRADOR,
 * atada a la factura padre vía `moraOrigenId`. Esta ND:
 *   - NO se envía a la DGII (es interna; el padre puede ser borrador/sin-ncf).
 *   - Es EXENTA de ITBIS (la mora no causa impuesto).
 *   - Aparece como su propia fila en cuentas por cobrar (tiene saldo propio).
 *
 * Se genera automáticamente vía cron (al vencer + gracia) o manualmente desde
 * el detalle de la factura.
 */

import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments, pagosRecibidos, products } from '@/lib/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';
import { getNcAplicadoCts } from '@/lib/facturas/notas-credito';
import {
  calcularMora, fechaPeriodo,
  type ConfigMora, type ModoMora,
} from '@/lib/cobranza/mora-calculo';

/**
 * Preview de la próxima mora automática de una factura, para mostrarla en el
 * detalle SIN generar nada. Read-only. Reusa `calcularMora`, así que el monto
 * coincide con lo que cobraría el cron.
 *   - 'inactiva'  → la empresa no tiene mora automática activa.
 *   - 'no_aplica' → no habrá cargo (sin saldo, sin vencimiento, tope, etc.).
 *   - 'pendiente' → habrá un cargo: `fecha` (cuándo) e `montoCents` (cuánto).
 *                   `yaVencida` = el cargo ya es exigible hoy; false = proyección.
 */
export type PreviewMora =
  | { estado: 'inactiva' }
  | { estado: 'no_aplica'; razon: string }
  | { estado: 'pendiente'; fecha: string; montoCents: number; yaVencida: boolean };

export async function previsualizarMoraDeFactura(ecfDocumentId: number): Promise<PreviewMora> {
  const [padre] = await db
    .select({
      id:              ecfDocuments.id,
      teamId:          ecfDocuments.teamId,
      encf:            ecfDocuments.encf,
      montoTotal:      ecfDocuments.montoTotal,
      estado:          ecfDocuments.estado,
      moraOrigenId:    ecfDocuments.moraOrigenId,
      tipoPago:        ecfDocuments.tipoPago,
      fechaLimitePago: ecfDocuments.fechaLimitePago,
    })
    .from(ecfDocuments)
    .where(eq(ecfDocuments.id, ecfDocumentId))
    .limit(1);

  if (!padre) return { estado: 'no_aplica', razon: 'not_found' };
  // La mora automática solo aplica a facturas a crédito con vencimiento; una
  // ND de mora nunca genera mora sobre sí misma; anulada no cobra.
  if (padre.moraOrigenId != null) return { estado: 'no_aplica', razon: 'es_nota_mora' };
  if (padre.estado === 'ANULADO') return { estado: 'no_aplica', razon: 'anulada' };
  if (padre.tipoPago !== 2 || !padre.fechaLimitePago) return { estado: 'no_aplica', razon: 'sin_vencimiento' };

  const [team] = await db
    .select({
      activo:           teams.recargoMoraActivo,
      porcentaje:       teams.recargoMoraPorcentaje,
      diasGracia:       teams.recargoMoraDiasGracia,
      modo:             teams.recargoMoraModo,
      montoCents:       teams.recargoMoraMontoCents,
      periodicidadDias: teams.recargoMoraPeriodicidadDias,
      compuesta:        teams.recargoMoraCompuesta,
      topeBps:          teams.recargoMoraTopeBps,
      maxPeriodos:      teams.recargoMoraMaxPeriodos,
    })
    .from(teams)
    .where(eq(teams.id, padre.teamId))
    .limit(1);

  if (!team?.activo) return { estado: 'inactiva' };

  const config: ConfigMora = {
    modo:             (team.modo ?? 'porcentaje') as ModoMora,
    porcentajeBps:    team.porcentaje ?? 0,
    montoCents:       team.montoCents ?? 0,
    diasGracia:       team.diasGracia ?? 0,
    periodicidadDias: team.periodicidadDias ?? 0,
    compuesta:        team.compuesta ?? false,
    topeBps:          team.topeBps ?? 0,
    maxPeriodos:      team.maxPeriodos ?? 0,
  };

  // Saldo real = total − pagos − NC aplicadas.
  const [{ pagado }] = await db
    .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.ecfDocumentId, padre.id), eq(pagosRecibidos.teamId, padre.teamId)));
  const ncAplicado = await getNcAplicadoCts(padre.teamId, padre.id, padre.encf);
  const saldoPadre = padre.montoTotal - Number(pagado ?? 0) - ncAplicado;
  if (saldoPadre <= 0) return { estado: 'no_aplica', razon: 'sin_saldo' };

  // Moras ya emitidas (mismo LEFT JOIN + GROUP BY que el generador).
  const notasMora = await db
    .select({
      montoTotal: ecfDocuments.montoTotal,
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(ecfDocuments)
    .leftJoin(pagosRecibidos, eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id))
    .where(and(eq(ecfDocuments.moraOrigenId, padre.id), ne(ecfDocuments.estado, 'ANULADO')))
    .groupBy(ecfDocuments.id, ecfDocuments.montoTotal);

  const periodosCobrados     = notasMora.length;
  const moraCobradaAcumCents = notasMora.reduce((s, n) => s + n.montoTotal, 0);
  const moraImpagaCents      = notasMora.reduce((s, n) => s + Math.max(0, n.montoTotal - Number(n.pagado ?? 0)), 0);

  const diasVencidoReal = Math.floor(
    (Date.now() - Date.parse(`${padre.fechaLimitePago}T00:00:00Z`)) / 86_400_000,
  );

  const entradaBase = {
    config,
    montoFacturaCents: padre.montoTotal,
    saldoFacturaCents: saldoPadre,
    moraImpagaCents,
    moraCobradaAcumCents,
    periodosCobrados,
  };

  // Cargo exigible HOY.
  const ahora = calcularMora({ ...entradaBase, diasVencido: diasVencidoReal });
  if (ahora.aplica) {
    return {
      estado: 'pendiente',
      fecha: fechaPeriodo(padre.fechaLimitePago, ahora.periodo, config),
      montoCents: ahora.montoCents,
      yaVencida: diasVencidoReal >= config.diasGracia,
    };
  }

  // Aún no vencida (o dentro de la gracia): proyectar el primer período pendiente
  // como si ya hubiera pasado la gracia, para anticipar cuándo y cuánto.
  if (ahora.razon === 'no_vencida') {
    const proyeccion = calcularMora({
      ...entradaBase,
      diasVencido: config.diasGracia + periodosCobrados * config.periodicidadDias,
    });
    if (proyeccion.aplica) {
      return {
        estado: 'pendiente',
        fecha: fechaPeriodo(padre.fechaLimitePago, proyeccion.periodo, config),
        montoCents: proyeccion.montoCents,
        yaVencida: false,
      };
    }
  }

  return { estado: 'no_aplica', razon: ahora.aplica ? 'ok' : ahora.razon };
}

export type GenerarNotaDebitoMoraResult =
  | { ok: true; notaDebitoId: number; montoCentavos: number }
  | { ok: false; reason:
      | 'not_found' | 'es_nota_mora' | 'anulada' | 'sin_saldo' | 'ya_existe'
      | 'mora_cero' | 'no_vencida' | 'max_periodos' | 'tope_alcanzado' };

export async function generarNotaDebitoMora(
  ecfDocumentId: number,
  opts: { createdBy?: number; origen?: 'cron' | 'manual' } = {},
): Promise<GenerarNotaDebitoMoraResult> {
  // ── Cargar la factura padre ────────────────────────────────────────────────
  const [padre] = await db
    .select({
      id:                   ecfDocuments.id,
      teamId:               ecfDocuments.teamId,
      clientId:             ecfDocuments.clientId,
      encf:                 ecfDocuments.encf,
      codigo:               ecfDocuments.codigo,
      montoTotal:           ecfDocuments.montoTotal,
      estado:               ecfDocuments.estado,
      rncComprador:         ecfDocuments.rncComprador,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      moraOrigenId:         ecfDocuments.moraOrigenId,
      tipoEcf:              ecfDocuments.tipoEcf,
      fechaLimitePago:      ecfDocuments.fechaLimitePago,
    })
    .from(ecfDocuments)
    .where(eq(ecfDocuments.id, ecfDocumentId))
    .limit(1);

  if (!padre) return { ok: false, reason: 'not_found' };

  // No mora sobre mora: si el padre YA es una ND de mora, abortar.
  if (padre.moraOrigenId != null) return { ok: false, reason: 'es_nota_mora' };

  if (padre.estado === 'ANULADO') return { ok: false, reason: 'anulada' };

  // ── Config del team ────────────────────────────────────────────────────────
  // recargoMoraActivo no se valida aquí: la generación manual debe funcionar
  // aunque esté desactivado. El cron solo procesa teams activos por su cuenta.
  const [team] = await db
    .select({
      porcentaje:       teams.recargoMoraPorcentaje,
      diasGracia:       teams.recargoMoraDiasGracia,
      modo:             teams.recargoMoraModo,
      montoCents:       teams.recargoMoraMontoCents,
      periodicidadDias: teams.recargoMoraPeriodicidadDias,
      compuesta:        teams.recargoMoraCompuesta,
      topeBps:          teams.recargoMoraTopeBps,
      maxPeriodos:      teams.recargoMoraMaxPeriodos,
    })
    .from(teams)
    .where(eq(teams.id, padre.teamId))
    .limit(1);

  // La mora se rige solo por la configuración central del team (sin overrides
  // por factura ni por plan).
  const config: ConfigMora = {
    modo:             (team?.modo ?? 'porcentaje') as ModoMora,
    porcentajeBps:    team?.porcentaje ?? 0,
    montoCents:       team?.montoCents ?? 0,
    diasGracia:       team?.diasGracia ?? 0,
    periodicidadDias: team?.periodicidadDias ?? 0,
    compuesta:        team?.compuesta ?? false,
    topeBps:          team?.topeBps ?? 0,
    maxPeriodos:      team?.maxPeriodos ?? 0,
  };

  // ── Saldo del padre = montoTotal − SUM(pagos) − NC aplicadas ───────────────
  const [{ pagado }] = await db
    .select({
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.ecfDocumentId, padre.id),
      eq(pagosRecibidos.teamId, padre.teamId),
    ));

  // NC vinculadas al padre acreditan contra su saldo: la mora solo aplica
  // sobre lo realmente adeudado.
  const ncAplicado = await getNcAplicadoCts(padre.teamId, padre.id, padre.encf);
  const saldoPadre = padre.montoTotal - Number(pagado ?? 0) - ncAplicado;
  if (saldoPadre <= 0) return { ok: false, reason: 'sin_saldo' };

  // ── Moras ya emitidas para esta factura ────────────────────────────────────
  // Se necesitan tres cifras: cuántos períodos van cobrados (para saber si
  // toca uno nuevo), cuánta mora sigue impaga (base compuesta) y cuánta se
  // cobró en total (tope). Las ANULADAS no cuentan para ninguna: anular una
  // mora es condonarla.
  // LEFT JOIN + GROUP BY en vez de subconsulta correlacionada: al interpolar
  // ${ecfDocuments.id} dentro de un `sql` anidado, Drizzle lo renderiza sin
  // calificar ("id"), y como pagos_recibidos también tiene columna id la
  // correlación casaba pr.ecf_document_id = pr.id → SUM siempre 0 (toda mora se
  // contaba impaga). El join califica bien y arregla la base compuesta.
  const notasMora = await db
    .select({
      montoTotal: ecfDocuments.montoTotal,
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(ecfDocuments)
    .leftJoin(pagosRecibidos, eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(ecfDocuments.moraOrigenId, padre.id),
      ne(ecfDocuments.estado, 'ANULADO'),
    ))
    .groupBy(ecfDocuments.id, ecfDocuments.montoTotal);

  const periodosCobrados     = notasMora.length;
  const moraCobradaAcumCents = notasMora.reduce((s, n) => s + n.montoTotal, 0);
  const moraImpagaCents      = notasMora.reduce(
    (s, n) => s + Math.max(0, n.montoTotal - Number(n.pagado ?? 0)), 0);

  // ── Días vencido ───────────────────────────────────────────────────────────
  // La generación manual sobre una factura sin fecha límite se trata como
  // vencida hoy: el usuario está pidiendo el cargo explícitamente.
  const diasVencido = padre.fechaLimitePago
    ? Math.floor((Date.now() - Date.parse(`${padre.fechaLimitePago}T00:00:00Z`)) / 86_400_000)
    : config.diasGracia;

  const calculo = calcularMora({
    config,
    montoFacturaCents: padre.montoTotal,
    saldoFacturaCents: saldoPadre,
    moraImpagaCents,
    moraCobradaAcumCents,
    periodosCobrados,
    diasVencido,
  });

  if (!calculo.aplica) {
    // 'periodo_ya_cobrado' conserva el nombre histórico 'ya_existe' hacia
    // afuera para no romper a los llamadores ni los mensajes de la UI.
    const mapa: Record<string, GenerarNotaDebitoMoraResult> = {
      no_vencida:         { ok: false, reason: 'no_vencida' },
      sin_saldo:          { ok: false, reason: 'sin_saldo' },
      periodo_ya_cobrado: { ok: false, reason: 'ya_existe' },
      max_periodos:       { ok: false, reason: 'max_periodos' },
      tope_alcanzado:     { ok: false, reason: 'tope_alcanzado' },
      monto_cero:         { ok: false, reason: 'mora_cero' },
    };
    return mapa[calculo.razon] ?? { ok: false, reason: 'mora_cero' };
  }

  const montoMora = calculo.montoCents;
  // Clave del período: es lo que hace idempotente al cron vía el índice único
  // (mora_origen_id, mora_periodo).
  const periodoClave = padre.fechaLimitePago
    ? fechaPeriodo(padre.fechaLimitePago, calculo.periodo, config)
    : new Date().toISOString().slice(0, 10);

  // ── Servicio "Interés por mora" del catálogo (find-or-create, reutilizable) ─
  // La línea de la ND referencia este producto en vez de texto suelto. El % de
  // mora NO vive aquí: sigue en teams.recargo_mora_porcentaje (fuente única).
  const moraProductoId = await getOrCreateMoraProducto(padre.teamId, opts.createdBy ?? null);

  // ── Insertar la ND tipo 33 (BORRADOR, exenta de ITBIS) ─────────────────────
  const codigo = await generarCodigoFactura(db, { teamId: padre.teamId, userId: opts?.createdBy ?? null, tipoEcf: '33' });
  const encf = `BOR-33-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const estadoPago = calcularEstadoPago({
    estado:      'BORRADOR',
    tipoPago:    2,
    montoTotal:  montoMora,
    totalPagado: 0,
  });

  const [nd] = await db
    .insert(ecfDocuments)
    .values({
      teamId:               padre.teamId,
      clientId:             padre.clientId,
      rncComprador:         padre.rncComprador,
      razonSocialComprador: padre.razonSocialComprador,
      tipoEcf:              '33',
      estado:               'BORRADOR',
      encf,
      codigo,
      montoTotal:           montoMora,
      totalItbis:           0,            // EXENTA
      tipoPago:             2,            // crédito (por cobrar)
      estadoPago,
      fechaEmision:         new Date(),
      // Referencia fiscal solo si el padre tiene un e-NCF real (empieza con 'E').
      ncfModificado:        padre.encf.startsWith('E') ? padre.encf : null,
      moraOrigenId:         padre.id,
      moraPeriodo:          periodoClave,
      notas:                `Nota de débito por mora — ${padre.codigo ?? padre.encf}`,
      lineasJson:           JSON.stringify([{
        productoId:              moraProductoId,
        nombreItem:              'Interés por mora',
        cantidadItem:            1,
        precioUnitarioItem:      montoMora / 100,
        tasaItbis:               'exento',
        indicadorBienoServicio:  '2',
      }]),
      createdBy:            opts.createdBy ?? null,
    })
    .returning({ id: ecfDocuments.id });

  return { ok: true, notaDebitoId: nd.id, montoCentavos: montoMora };
}

/**
 * Devuelve el id del servicio "Interés por mora" del team, creándolo si falta.
 * Servicio de sistema (es_mora=true), exento de ITBIS, sin precio fijo (el monto
 * es dinámico por factura). Único por team — el índice parcial protege carreras.
 */
async function getOrCreateMoraProducto(teamId: number, createdBy: number | null): Promise<number> {
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.teamId, teamId), eq(products.esMora, true)))
    .limit(1);
  if (existing) return existing.id;

  try {
    const [creado] = await db
      .insert(products)
      .values({
        teamId,
        nombre:      'Interés por mora',
        descripcion: 'Recargo automático por pago tardío. El % se configura en Mi empresa.',
        tipo:        'servicio',
        tasaItbis:   'exento',
        precio:      0,            // monto dinámico por factura; sin precio fijo de catálogo
        esMora:      true,
        activo:      'true',
        createdBy,
      })
      .returning({ id: products.id });
    return creado.id;
  } catch {
    // Carrera: otro proceso lo creó (índice único parcial) → re-seleccionar.
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.teamId, teamId), eq(products.esMora, true)))
      .limit(1);
    if (!row) throw new Error('No se pudo obtener el servicio de mora');
    return row.id;
  }
}
