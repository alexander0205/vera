/**
 * POST /api/ecf/emitir
 *
 * Modos:
 *   modo = 'emitir'   — delega a ecf-api (firma + envío DGII + NCF asignado allá)
 *   modo = 'borrador' — guarda localmente sin enviar
 *
 * ecf-api gestiona el P12, la firma y la comunicación con DGII.
 * emitedo guarda el resultado para auditoría, PDFs y webhooks salientes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, teamMembers, dependientes, pagosRecibidos, products, cajaMovimientos } from '@/lib/db/schema';
import { descontarInventario } from '@/lib/inventario/descuento';
import { restaurarInventario } from '@/lib/inventario/devolucion';
import { getUser, getTeamIdForUser, getMonthlyEcfCount, getPlanLimit, registrarPago, registrarPagosSplit } from '@/lib/db/queries';
import { getPlan, PLANS } from '@/lib/config/plans';
import { bloquearSiSoloLectura } from '@/lib/suscripcion/guard';
import { eq, and, sql, isNull, gte, desc, inArray } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { validarPreciosDeCatalogo } from '@/lib/facturas/precio-guard';
import { validarVariantes } from '@/lib/inventario/variante-guard';
import { calcularTotales } from '@/lib/ecf/types';
import { logError, logInfo } from '@/lib/logger';
import { logAudit, getIp } from '@/lib/audit';
import { emision, EcfApiError } from '@/lib/ecf-api/client';
import { resolveEcfApiError } from '@/lib/ecf-api/error-codes';
import { ensureContribuyente } from '@/lib/ecf-api/contribuyente';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago, recalcularEstadoPago } from '@/lib/facturas/estado-pago';
import { mapToEcfApiDto } from '@/lib/ecf-api/emision-mapper';
import { withRequestAuditContext } from '@/lib/db/audit-context';
import { requireTurnoAbierto, configCaja } from '@/lib/caja/guard';
import { registrarMovimiento } from '@/lib/caja/core';
import { labelMetodo } from '@/lib/pagos/metodos';
import { getAmbienteTenant, mensajeAmbienteNoProduccion } from '@/lib/ecf-api/ambiente';
import { esTipoVentaFiscal } from '@/lib/ecf/categorias';

// ─── Schema de validación ─────────────────────────────────────────────────────

const itemSchema = z.object({
  nombreItem:             z.string().min(1),
  descripcionItem:        z.string().optional(),
  cantidadItem:           z.number().positive(),
  unidadMedidaItem:       z.string().optional(),
  precioUnitarioItem:     z.number().positive(),
  descuentoMonto:         z.number().min(0).optional(),
  tasaItbis:              z.union([z.literal(0.18), z.literal(0.16), z.literal(0)]).optional(),
  indicadorBienoServicio: z.union([z.literal(1), z.literal(2)]).optional(),
  // Beneficiario por línea — metadato, no va al XML DGII
  dependienteId:          z.number().int().positive().optional().nullable(),
  dependienteNombre:      z.string().max(255).optional(),
  // Control de inventario — metadato, no va al XML DGII
  productoId:             z.number().int().positive().optional().nullable(),
  // Variante vendida — el descuento de stock pega a esta variante (lib/inventario/descuento.ts).
  variantId:              z.number().int().positive().optional().nullable(),
});

const retencionSchema = z.object({
  id:         z.string(),
  nombre:     z.string(),
  porcentaje: z.number(),
  tipo:       z.enum(['itbis', 'isr', 'otro']),
  monto:      z.number(),
});

const emitirSchema = z.object({
  modo:                 z.enum(['emitir', 'borrador']).default('emitir'),
  /**
   * Origen de la petición. 'habilitacion' identifica el Set de Pruebas del
   * asistente DGII, único flujo autorizado a emitir fuera de Producción.
   * Requiere 'configuracion:gestionar' (ver el gate de ambiente más abajo).
   */
  origen:               z.enum(['habilitacion']).optional(),
  // 'sin-ncf' only allowed in borrador mode (validated below)
  tipoEcf:              z.enum(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47', 'sin-ncf']),
  rncComprador:         z.preprocess(
    v => typeof v === 'string' ? v.trim().toUpperCase() : v,
    z.string().regex(/^\d{9,11}$|^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,20}$/, 'Documento inválido: RNC (9 dígitos), cédula (11 dígitos) o pasaporte (letras y números)').optional()
  ),
  razonSocialComprador: z.string().optional(),
  emailComprador:       z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  tipoPago:             z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  fechaLimitePago:      z.string().optional(),
  // Fecha de emisión elegida por el usuario (YYYY-MM-DD). Solo se honra en
  // facturas sin-ncf y solo si el rol tiene 'facturas:fecha-personalizada'
  // (ver fechaEmisionCustom abajo). Para e-CF fiscal la fecha la fija la DGII.
  fechaEmision:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Campos del formulario de gastos. Son datos del comprobante recibido y no
  // forman parte del XML que la empresa podría emitir a DGII.
  categoriaGasto:       z.string().max(100).optional(),
  ncfProveedor:         z.string().max(40).optional(),
  fechaGasto:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items:                z.array(itemSchema).min(1),
  ncfModificado:        z.string().optional(),
  codigoModificacion:   z.coerce.number().int().min(1).max(5).optional(),
  fechaNcfModificado:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  razonModificacion:    z.string().max(500).optional(),
  // Vínculo por id al documento padre (flujo "crear nota desde factura").
  // Más robusto que ncfModificado: funciona aunque el padre aún sea borrador.
  origenDocumentoId:    z.number().int().positive().optional(),
  // Acepta number (1..6) o string ("01".."06" o "1".."6"). Mapper normaliza a XSD "0X".
  tipoIngresos: z.union([
    z.coerce.number().int().min(1).max(6),
    z.string().regex(/^(0?[1-6])$/),
  ]).optional(),

  notas:               z.string().optional(),
  terminosCondiciones: z.string().optional(),
  pieFactura:          z.string().optional(),
  retenciones:         z.array(retencionSchema).optional(),
  comentario:          z.string().optional(),

  pagoRecibido: z.boolean().optional(),
  pagoMetodo:   z.string().optional(),
  pagoCuenta:   z.string().optional(),
  pagoValor:    z.number().min(0).optional(),
  pagoFecha:    z.string().optional(),
  // Pago dividido (split): varios métodos en una sola operación. Cuando viene,
  // tiene prioridad sobre el pago single y se registra vía registrarPagosSplit.
  pagos:        z.array(z.object({ metodo: z.string(), valor: z.number().min(0) })).optional(),

  clientId:   z.number().int().positive().optional(),
  lineasJson: z.string().optional(),

  // Override de e-NCF para habilitación (no consume la secuencia del rango)
  encfOverride: z.string().regex(/^E\d{12}$/).optional(),

  // Tipo 47 — tasa de retención ISR pagos al exterior.
  // Default 0.27 (general). 0.10 países con tratado, 0.15 servicios técnicos, etc.
  tasaIsrRetencion: z.number().min(0).max(1).optional(),

  // Dependiente del cliente — metadato, no va al XML DGII
  dependienteId:     z.number().int().positive().optional(),
  dependienteNombre: z.string().max(255).optional(),

  // Edición de borrador existente — hacer UPDATE en lugar de INSERT
  borradorId: z.number().int().positive().optional(),

  // Metadatos de venta — persisten en ecf_documents, no van al XML DGII
  almacenId:      z.number().int().positive().optional().nullable(),
  vendedorId:     z.number().int().positive().optional().nullable(),
  listaPreciosId: z.number().int().positive().optional().nullable(),

  // POS: tipo de orden (operativo, no fiscal — no va al XML DGII). Clasifica el
  // recibo en el historial del POS. Ver ecf_documents.tipo_orden (mig 0109).
  tipoOrden: z.enum(['comer-aqui', 'para-llevar', 'delivery', 'mostrador']).optional(),

  // Traza anti-duplicados (tracking): identifica el botón + secuencia de clicks
  // del montaje del form que disparó este submit. Solo para diagnóstico.
  _traza: z.object({
    fid:   z.string().max(40).optional(),
    seq:   z.number().int().optional(),
    boton: z.string().max(40).optional(),
    ts:    z.number().optional(),
  }).optional(),
});

// ─── Adquirir próximo eNCF de secuencia local ────────────────────────────────
// Pre-emit: emitedo es la fuente de verdad del NCF.
// Toma la mejor secuencia activa (preferida, luego más disponibles), incrementa
// `secuencia_actual` atómicamente con `FOR UPDATE SKIP LOCKED` y retorna el
// número consumido formateado como eNCF (`E{tipo}{10 dígitos}`).
//
// Diseño:
// - SKIP LOCKED → emisiones concurrentes no bloquean entre sí (cada una toma
//   la siguiente fila libre).
// - El número asignado es `secuencia_actual - 1` después del UPDATE.
// - Si el rango está agotado o vencido, retorna null (caller decide error).
async function acquireNextEncf(
  teamId: number,
  tipoEcf: string,
): Promise<{ encf: string; sequenceId: number; numero: string; fechaVencimiento: string | null } | null> {
  const rows = await db.execute<{ id: number; numero: string; fecha_venc: string | null }>(sql`
    UPDATE sequences
    SET secuencia_actual = secuencia_actual + 1,
        updated_at       = NOW()
    WHERE id = (
      SELECT id FROM sequences
      WHERE team_id = ${teamId}
        AND tipo_ecf = ${tipoEcf}
        AND secuencia_actual <= secuencia_hasta
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento > NOW())
      ORDER BY preferida DESC, (secuencia_hasta - secuencia_actual) DESC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, (secuencia_actual - 1)::text AS numero,
              fecha_vencimiento::date::text AS fecha_venc
  `);

  const row = rows[0] as { id: number; numero: string; fecha_venc: string | null } | undefined;
  if (!row) return null;

  const encf = `E${tipoEcf}${row.numero.padStart(10, '0')}`;
  return { encf, sequenceId: row.id, numero: row.numero, fechaVencimiento: row.fecha_venc ?? null };
}

// ─── Bloqueo por stock agotado ────────────────────────────────────────────────
// Compartido entre modo emitir y modo borrador — ahora que el borrador también
// descuenta stock al guardarse, debe pasar por el mismo chequeo.
async function validarStockAgotado(
  teamId: number,
  items: Array<{ indicadorBienoServicio?: 1 | 2; productoId?: number | null }>,
): Promise<string | null> {
  const bienesIds = items
    .filter(i => i.indicadorBienoServicio === 1 && i.productoId)
    .map(i => i.productoId as number);
  if (bienesIds.length === 0) return null;

  const prods = await db
    .select({
      id:                   products.id,
      nombre:               products.nombre,
      stockActual:          products.stockActual,
      controlaInventario:   products.controlaInventario,
      permiteVentaSinStock: products.permiteVentaSinStock,
    })
    .from(products)
    .where(and(eq(products.teamId, teamId), inArray(products.id, bienesIds)));

  const bloqueados = prods.filter(
    p => p.controlaInventario && p.stockActual === 0 && !p.permiteVentaSinStock,
  );
  if (bloqueados.length === 0) return null;

  const nombres = bloqueados.map(p => `"${p.nombre}"`).join(', ');
  return `No se puede guardar: los siguientes productos están agotados y no permiten venta sin stock: ${nombres}.`;
}

// ─── Gastos (43/47): dinero que SALE, no ingreso ──────────────────────────────
// Un gasto pasa por este mismo motor que las ventas, pero su efectivo NO entra a
// la caja: sale. Estos helpers dan ese trato — el pago del gasto no se ata al
// turno (así `calcularEsperado` no lo suma como ingreso) y la porción en efectivo
// se registra como movimiento GASTO, que el cierre RESTA.

const esMetodoEfectivo = (m?: string | null): boolean =>
  !!m && ['efectivo', 'cash'].includes(m.trim().toLowerCase());

/** Centavos pagados en efectivo, sea pago único o split. */
function porcionEfectivoCents(data: {
  pagos?: Array<{ metodo: string; valor: number }>;
  pagoRecibido?: boolean; pagoMetodo?: string; pagoValor?: number;
}): number {
  if (data.pagos?.length) {
    return data.pagos
      .filter(p => p.valor > 0 && esMetodoEfectivo(p.metodo))
      .reduce((s, p) => s + Math.round(p.valor * 100), 0);
  }
  if (data.pagoRecibido && data.pagoValor && data.pagoValor > 0 && esMetodoEfectivo(data.pagoMetodo)) {
    return Math.round(data.pagoValor * 100);
  }
  return 0;
}

/** Registra la salida de efectivo de un gasto/compra como movimiento GASTO del turno. */
async function registrarSalidaGasto(opts: {
  teamId: number; turnoId: number | null | undefined;
  montoCents: number; descripcion: string; userId: number;
  ecfDocumentId?: number | null;
}): Promise<void> {
  if (!opts.turnoId || opts.montoCents <= 0) return;
  try {
    await registrarMovimiento({
      teamId:        opts.teamId,
      turnoId:       opts.turnoId,
      ecfDocumentId: opts.ecfDocumentId ?? null,
      tipo:          'GASTO',
      montoCentavos: opts.montoCents,
      metodo:        'efectivo',
      descripcion:   opts.descripcion,
      createdBy:     opts.userId,
    });
  } catch (e) {
    console.error('[ecf/emitir] registrar salida de gasto en caja falló', e);
  }
}

/**
 * Reconcilia la salida de caja de un gasto/compra al EDITAR su borrador. Los
 * movimientos son append-only, así que en vez de acumular al re-guardar: borra
 * la salida previa de ESTE documento en el turno actual (abierto) y la vuelve a
 * crear con el efectivo vigente. Si la salida ya quedó registrada en OTRO turno
 * (p. ej. uno cerrado ya cuadrado), no se toca ni se duplica.
 */
async function reconciliarSalidaBorrador(opts: {
  teamId: number; ecfDocumentId: number; turnoActualId: number | null | undefined;
  montoCents: number; descripcion: string; userId: number;
}): Promise<void> {
  try {
    const movs = await db
      .select({ id: cajaMovimientos.id, turnoId: cajaMovimientos.turnoId })
      .from(cajaMovimientos)
      .where(and(
        eq(cajaMovimientos.ecfDocumentId, opts.ecfDocumentId),
        eq(cajaMovimientos.tipo, 'GASTO'),
      ));
    const yaEnOtroTurno   = movs.some(m => m.turnoId !== opts.turnoActualId);
    const idsTurnoActual  = movs.filter(m => m.turnoId === opts.turnoActualId).map(m => m.id);
    if (idsTurnoActual.length) {
      await db.delete(cajaMovimientos).where(inArray(cajaMovimientos.id, idsTurnoActual));
    }
    if (!yaEnOtroTurno && opts.montoCents > 0 && opts.turnoActualId) {
      await registrarSalidaGasto({
        teamId:        opts.teamId,
        turnoId:       opts.turnoActualId,
        montoCents:    opts.montoCents,
        descripcion:   opts.descripcion,
        userId:        opts.userId,
        ecfDocumentId: opts.ecfDocumentId,
      });
    }
  } catch (e) {
    console.error('[ecf/emitir] reconciliar salida de gasto/compra falló', e);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Sesión y team activo en paralelo (ambos cacheados por-request). Antes eran
    // dos await seriales contra Neon (~142ms c/u en us-east-1).
    const [user, teamId] = await Promise.all([getUser(), getTeamIdForUser()]);
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!teamId) return NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 });

    // ── Gate: facturas:crear ──────────────────────────────────────────────────
    // platformRole ya viene en el row de getUser() → no re-consultarlo. El rol de
    // miembro y los datos del team son independientes entre sí → un round-trip.
    const [[m], [team]] = await Promise.all([
      db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
      db.select().from(teams).where(eq(teams.id, teamId)).limit(1),
    ]);
    if (!await userCanForTeam(teamId, user.platformRole, m?.role, 'facturas:crear')) {
      return NextResponse.json({ error: 'Sin permiso para crear facturas' }, { status: 403 });
    }

    // ── Gate: suscripción viva ────────────────────────────────────────────────
    // Antes del límite del plan y antes del borrador: en solo-lectura no se
    // crea NADA, ni siquiera un borrador. El límite de comprobantes pregunta
    // "¿te queda cupo?"; esto pregunta "¿tienes plan?", que es lo primero.
    const bloqueo = await bloquearSiSoloLectura(teamId);
    if (bloqueo) return bloqueo;

    const body = await request.json();
    const modoPrevio = body?.modo ?? 'emitir';
    // Solo para pruebas internas — no está en el schema público
    const skipRangeValidation: boolean = body?.skipRangeValidation === true;

    if (modoPrevio !== 'borrador' && !team?.rnc) {
      return NextResponse.json(
        { error: 'RNC no configurado. Completa el perfil de tu empresa.' },
        { status: 422 },
      );
    }

    // Verificar límite del plan
    if (modoPrevio !== 'borrador') {
      const [monthlyCount, planLimit] = await Promise.all([
        getMonthlyEcfCount(teamId),
        Promise.resolve(getPlanLimit(team.planName, team.subscriptionStatus)),
      ]);

      if (planLimit !== -1 && monthlyCount >= planLimit) {
        const currentPlan = getPlan(team.planName);
        const nextPlan = PLANS.find(p => p.limits.docs > currentPlan.limits.docs || p.limits.docs === -1);
        const sugerencia = nextPlan
          ? `Actualiza al plan ${nextPlan.name} ($${nextPlan.price}/mes).`
          : 'Contacta a soporte para un plan Enterprise.';
        return NextResponse.json(
          {
            error: `Límite mensual alcanzado. Tu plan ${currentPlan.name} permite ${planLimit} comprobantes/mes. Has emitido ${monthlyCount} este mes.`,
            detalles: { planActual: currentPlan.name, limite: planLimit, emitidoEsteMes: monthlyCount, sugerencia, urlUpgrade: '/pricing' },
          },
          { status: 403 },
        );
      }
    }

    const parsed = emitirSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // Gasto (e43 menores / e47 pagos al exterior): dinero que SALE. Su efectivo
    // no entra a la caja como ingreso — se trata como salida (ver helpers arriba).
    const esGasto = data.tipoEcf === '43' || data.tipoEcf === '47';

    // Salida de dinero para la CAJA: gastos + compras (e41). Una compra a un
    // proveedor también es efectivo que sale, no un ingreso. Comparte con el gasto
    // el trato de caja (pago sin turno + movimiento de salida + documento fuera
    // de los "Comprobantes del turno"), pero NO el de inventario: una compra sí
    // toca stock (ver `esGasto` en el bloque de descontarInventario más abajo).
    const esSalidaDinero = data.tipoEcf === '41' || esGasto;
    const etiquetaSalida = data.tipoEcf === '41' ? 'Compra' : 'Gasto';

    // ── Gate: facturas:precio-editar ──────────────────────────────────────────
    // Sin el permiso, cada línea tiene que venir del catálogo y al precio del
    // catálogo. El formulario ya deja los campos en solo lectura; esto es lo que
    // sostiene la regla cuando el POST no viene del formulario.
    if (!await userCanForTeam(teamId, user.platformRole, m?.role, 'facturas:precio-editar')) {
      const errPrecio = await validarPreciosDeCatalogo({
        teamId,
        lineas: data.items,
        listaPreciosId: data.listaPreciosId,
      });
      if (errPrecio) return NextResponse.json({ error: errPrecio }, { status: 403 });
    }

    // ── Gate: variante obligatoria ────────────────────────────────────────────
    // Un producto con ejes de variante (talla, color…) no se puede vender sin
    // decir cuál. El formulario y el POS ya lo piden; esto sostiene la regla
    // cuando el POST no viene de ahí. Sin esto el descuento cae al stock del
    // producto y el de las variantes queda intacto: los números dejan de cuadrar.
    const errVariante = await validarVariantes(teamId, data.items);
    if (errVariante) return NextResponse.json({ error: errVariante }, { status: 422 });

    // Cross-field: sin-ncf solo permitido en modo borrador
    if (data.tipoEcf === 'sin-ncf' && data.modo !== 'borrador') {
      return NextResponse.json(
        { error: 'tipoEcf sin-ncf solo puede usarse en modo borrador. Selecciona un tipo de e-CF para emitir a la DGII.' },
        { status: 400 },
      );
    }

    // ── Gate de ambiente DGII ────────────────────────────────────────────────
    // Solo un contribuyente en 'Produccion' emite comprobantes con valor fiscal.
    // La excepción es el Set de Pruebas de la habilitación, que corre en
    // TesteCF/CerteCF por definición: sin él nadie podría llegar a Producción.
    //
    // La excepción NO se apoya en `skipRangeValidation` — ese flag lo puede
    // poner cualquier cliente. Exige un origen explícito + permiso de admin.
    const esHabilitacion = data.origen === 'habilitacion';

    if (esHabilitacion) {
      // El Set de Pruebas corre en TesteCF/CerteCF por definición; sin esta
      // excepción ninguna empresa podría completar la habilitación. Se exige
      // permiso de administrador porque salta el gate de ambiente.
      if (!await userCanForTeam(teamId, user.platformRole, m?.role, 'configuracion:gestionar')) {
        return NextResponse.json(
          { error: 'Solo un administrador puede ejecutar el Set de Pruebas de habilitación.' },
          { status: 403 },
        );
      }
    } else if (data.modo !== 'borrador' || esTipoVentaFiscal(data.tipoEcf)) {
      // Se consulta el ambiente en dos casos: al emitir cualquier cosa a la
      // DGII, y al crear un borrador de VENTA con tipo fiscal — ese borrador
      // solo existe para emitirse después, así que fuera de Producción nace
      // muerto. Las notas de crédito/débito y compras/gastos sí pueden
      // guardarse como borrador: son documentos internos.
      const ambiente = await getAmbienteTenant(teamId);
      if (ambiente !== 'Produccion') {
        return NextResponse.json(
          { error: mensajeAmbienteNoProduccion(ambiente), ambiente },
          { status: 403 },
        );
      }
    }

    // ── Fecha de emisión personalizada (sin-ncf) ─────────────────────────────
    // Permite registrar cobros de fechas pasadas. Se honra solo cuando: (1) es
    // sin-ncf, (2) el rol tiene 'facturas:fecha-personalizada' (admin/owner).
    // Para e-CF fiscal la fecha la asigna la DGII, nunca el usuario. Si no
    // aplica, queda null y los inserts usan new Date() como siempre. Usamos
    // T12:00:00 para evitar el corrimiento de día UTC↔RD.
    const fechaEmisionCustom =
      data.tipoEcf === 'sin-ncf' &&
      data.fechaEmision &&
      await userCanForTeam(teamId, user.platformRole, m?.role, 'facturas:fecha-personalizada')
        ? new Date(`${data.fechaEmision}T12:00:00`)
        : null;

    // ── Resolver documento padre (notas tipos 33/34) ─────────────────────────
    // Por id (origenDocumentoId — flujo "crear nota desde factura") o por
    // e-NCF tipeado (ncfModificado). El vínculo por id se persiste siempre.
    let padreDoc: {
      id: number; encf: string; tipoEcf: string; estado: string;
      montoTotal: number; fechaEmision: Date;
    } | null = null;

    if (data.origenDocumentoId) {
      const [p] = await db
        .select({
          id: ecfDocuments.id, encf: ecfDocuments.encf, tipoEcf: ecfDocuments.tipoEcf,
          estado: ecfDocuments.estado, montoTotal: ecfDocuments.montoTotal,
          fechaEmision: ecfDocuments.fechaEmision,
        })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.id, data.origenDocumentoId), eq(ecfDocuments.teamId, teamId)))
        .limit(1);
      if (!p) {
        return NextResponse.json({ error: 'Documento padre no encontrado' }, { status: 404 });
      }
      padreDoc = p;
    } else if (data.ncfModificado) {
      const [p] = await db
        .select({
          id: ecfDocuments.id, encf: ecfDocuments.encf, tipoEcf: ecfDocuments.tipoEcf,
          estado: ecfDocuments.estado, montoTotal: ecfDocuments.montoTotal,
          fechaEmision: ecfDocuments.fechaEmision,
        })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, data.ncfModificado)))
        .limit(1);
      // Puede no existir localmente (NCF emitido fuera de emitedo) — permitido.
      padreDoc = p ?? null;
    }

    if (padreDoc) {
      if (padreDoc.tipoEcf === '33' || padreDoc.tipoEcf === '34') {
        return NextResponse.json(
          { error: 'No se puede crear una nota sobre otra nota de crédito/débito.' },
          { status: 422 },
        );
      }
      if (padreDoc.estado === 'ANULADO') {
        return NextResponse.json(
          { error: 'La factura referenciada está anulada. No admite notas.' },
          { status: 422 },
        );
      }
      // Autocompletar ncfModificado desde el padre cuando tiene e-NCF real.
      if (!data.ncfModificado && /^E\d/.test(padreDoc.encf)) {
        data.ncfModificado = padreDoc.encf;
      }
      // Validación de montos para Nota de Crédito: nunca acreditar más que el
      // total de la factura; código 1 (Anula NCF) exige el monto total exacto.
      if (data.tipoEcf === '34') {
        const montoNcCts = Math.round(calcularTotales(data.items).montoTotal * 100);
        if (montoNcCts > padreDoc.montoTotal) {
          return NextResponse.json(
            {
              error: `La nota de crédito (RD$${(montoNcCts / 100).toFixed(2)}) excede el total de la factura referenciada (RD$${(padreDoc.montoTotal / 100).toFixed(2)}).`,
            },
            { status: 422 },
          );
        }
        if (data.codigoModificacion === 1 && montoNcCts !== padreDoc.montoTotal) {
          return NextResponse.json(
            {
              error: `Código de modificación 1 (Anula NCF) requiere el monto total exacto de la factura (RD$${(padreDoc.montoTotal / 100).toFixed(2)}). Para una reducción parcial usa el código 3 (Corrige monto).`,
            },
            { status: 422 },
          );
        }
      }
    }

    // Saldo a favor del cliente generado por una Nota de Crédito (modelo nuevo):
    // capado a lo PAGADO de la factura origen (no se acredita más de lo que el
    // cliente realmente pagó). Sin padre en el sistema (factura externa) → no hay
    // forma de capar, se acredita el total. NULL para no-NC: no genera crédito y la
    // factura conserva su comportamiento de saldo.
    let creditoGeneradoCents: number | null = null;
    if (data.tipoEcf === '34') {
      const montoNcCts = Math.round(calcularTotales(data.items).montoTotal * 100);
      if (padreDoc) {
        const [pg] = await db
          .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
          .from(pagosRecibidos)
          .where(eq(pagosRecibidos.ecfDocumentId, padreDoc.id));
        creditoGeneradoCents = Math.min(montoNcCts, Number(pg?.pagado ?? 0));
      } else {
        creditoGeneradoCents = montoNcCts;
      }
    }

    // Las notas 33/34 solo pueden EMITIRSE a DGII referenciando un e-NCF real.
    if ((data.tipoEcf === '33' || data.tipoEcf === '34') && data.modo !== 'borrador' && !data.ncfModificado) {
      return NextResponse.json(
        {
          error: 'Las notas de crédito/débito requieren el e-NCF que modifican para emitirse a la DGII. Si la factura original no tiene e-CF, guarda la nota como borrador.',
        },
        { status: 400 },
      );
    }

    // Cross-field: cuando se referencia un NCF que se modifica (tipos 33, 34),
    // codigoModificacion y fechaNcfModificado son obligatorios.
    if (data.ncfModificado && data.modo !== 'borrador') {
      if (data.codigoModificacion === undefined) {
        return NextResponse.json(
          { error: 'codigoModificacion es obligatorio cuando se referencia un NCF modificado (tipos 33, 34).' },
          { status: 400 },
        );
      }
      if (!data.fechaNcfModificado) {
        return NextResponse.json(
          { error: 'fechaNcfModificado es obligatoria cuando se referencia un NCF modificado (tipos 33, 34).' },
          { status: 400 },
        );
      }
    }

    // Cross-doc: si se referencia un padre, validar que ese padre tenga eCF
    // real (no sin-ncf, no borrador). NC con eCF sobre factura sin-eCF es
    // incoherente — la factura padre debe promoverse primero a eCF via
    // "Enviar a DGII" antes de poder emitir la NC con eCF.
    if (padreDoc && data.modo !== 'borrador' && data.tipoEcf !== 'sin-ncf') {
      const parentSinEcf = padreDoc.tipoEcf === 'sin-ncf'
        || (padreDoc.encf?.startsWith('BOR-') ?? false);
      if (parentSinEcf) {
        return NextResponse.json(
          {
            error: 'La factura referenciada no tiene e-CF',
            mensaje: 'No puedes emitir una NC con e-CF sobre una factura sin e-CF. Primero envía la factura padre a la DGII ("Enviar a DGII" en el detalle), o guarda esta nota como borrador.',
            parentEncf: padreDoc.encf,
            parentTipoEcf: padreDoc.tipoEcf,
          },
          { status: 409 },
        );
      }
    }

    // Cross-field: tipoPago=2 (crédito) requiere fechaLimitePago.
    if (data.tipoPago === 2 && !data.fechaLimitePago && data.modo !== 'borrador') {
      return NextResponse.json(
        { error: 'fechaLimitePago es obligatoria para tipo de pago Crédito (tipoPago=2).' },
        { status: 400 },
      );
    }

    // ── Validación dependiente (por línea) ───────────────────────────────────
    if (data.clientId) {
      // Count how many dependientes this client has (scoped to team for security)
      const [depCount] = await db
        .select({ cnt: sql`COUNT(*)::int` })
        .from(dependientes)
        .where(and(eq(dependientes.clientId, data.clientId), eq(dependientes.teamId, teamId)));
      const hasDependientes = Number((depCount as { cnt: number })?.cnt ?? 0) > 0;

      if (hasDependientes) {
        // Validar que cada ítem con nombre tenga dependienteId
        const itemsSinBenef = data.items.filter(i => i.nombreItem.trim() && !i.dependienteId);
        if (itemsSinBenef.length > 0) {
          return NextResponse.json(
            { error: 'Cada ítem requiere un beneficiario cuando el cliente tiene dependientes.' },
            { status: 422 },
          );
        }
      }

      // Security: verify all submitted dependienteIds belong to this clientId and team
      const depIdsSubmitted = [...new Set(
        data.items
          .map(i => i.dependienteId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      )];
      if (depIdsSubmitted.length > 0) {
        const validDeps = await db
          .select({ id: dependientes.id })
          .from(dependientes)
          .where(and(
            eq(dependientes.clientId, data.clientId),
            eq(dependientes.teamId,   teamId),
          ));
        const validIds = new Set(validDeps.map(d => d.id));
        const invalid  = depIdsSubmitted.find(id => !validIds.has(id));
        if (invalid) {
          return NextResponse.json(
            { error: 'Uno o más beneficiarios seleccionados no pertenecen a este cliente.' },
            { status: 422 },
          );
        }
      }
    }

    const extraFields = {
      almacenId:      data.almacenId      ?? null,
      vendedorId:     data.vendedorId     ?? null,
      listaPreciosId: data.listaPreciosId ?? null,
      tipoOrden:      data.tipoOrden      ?? null,
      notas:               data.notas          || null,
      terminosCondiciones: data.terminosCondiciones || null,
      pieFactura:          data.pieFactura      || null,
      retenciones:         data.retenciones?.length ? JSON.stringify(data.retenciones) : null,
      comentario:          data.comentario      || null,
      pagoRecibido:        data.pagoRecibido    ? 'true' : 'false',
      pagoMetodo:          data.pagoMetodo      || null,
      pagoCuenta:          data.pagoCuenta      || null,
      pagoValorCts:        data.pagoValor       ? Math.round(data.pagoValor * 100) : 0,
      pagoFecha:           data.pagoFecha       || null,
      totalRetenciones:    data.retenciones
        ? Math.round(data.retenciones.reduce((s, r) => s + r.monto, 0) * 100)
        : 0,
    };

    // ── MODO BORRADOR ──────────────────────────────────────────────────────────
    if (data.modo === 'borrador') {
      // Cuadre de caja: sin turno ABIERTO no se guarda ni un borrador. El
      // borrador puede llevar cobro (el POS cobra en borrador), así que dejarlo
      // pasar metía efectivo fuera del cuadre. Con turno, se le atribuye para
      // que entre en el esperado del cierre.
      const guard = await requireTurnoAbierto(teamId, user.id, configCaja(team));
      if (!guard.ok) {
        return NextResponse.json({ error: guard.error, code: guard.code }, { status: 409 });
      }
      const turnoBorradorId = guard.turno?.id ?? null;

      // Config empresa: si la factura registra un pago con un método marcado como
      // "obliga DGII", no se puede guardar como borrador — debe emitirse a la DGII.
      // Excepción: ventas de POS con turno de caja abierto. El cajero ya cobró en
      // el momento (efectivo/tarjeta físico) y el ticket sin-ncf/borrador ES la
      // venta final — el POS no tiene un paso "Emitir" posterior al que remitir
      // al cajero, así que bloquear aquí dejaría el cobro sin forma de completarse.
      const metodosObliga = new Set(
        ((team.metodosObligaDgii as string[] | null) ?? []).map(m => m.trim().toLowerCase()),
      );
      if (metodosObliga.size > 0 && !turnoBorradorId) {
        const metodosUsados = (data.pagos?.length
          ? data.pagos.map(p => p.metodo)
          : (data.pagoMetodo ? [data.pagoMetodo] : []))
          .map(m => m.trim().toLowerCase());
        const bloqueado = metodosUsados.find(m => metodosObliga.has(m));
        if (bloqueado) {
          // 'sin-ncf' nunca va a la DGII (solo existe como borrador). Si el método
          // obliga DGII, hay que cambiar el tipo de comprobante a uno fiscal ANTES
          // de emitir — decir "usa Emitir" sería engañoso porque no está disponible.
          const requiereTipoFiscal = data.tipoEcf === 'sin-ncf';
          const metodoLbl = labelMetodo(bloqueado);
          return NextResponse.json(
            {
              error: requiereTipoFiscal
                ? `El método de pago «${metodoLbl}» obliga a facturar a la DGII. Cambia el tipo de comprobante de «Sin NCF» a uno fiscal (Crédito Fiscal, Consumo, etc.) y emite la factura.`
                : `El método de pago «${metodoLbl}» requiere emitir la factura a la DGII — no se puede guardar como borrador. Usa "Emitir" para enviarla.`,
              metodoObligaDgii: bloqueado,
              requiereTipoFiscal,
            },
            { status: 422 },
          );
        }
      }

      const totales  = calcularTotales(data.items);
      const montoCts = Math.round(totales.montoTotal * 100);

      // ── Editar borrador existente (UPDATE) ──────────────────────────────────
      if (data.borradorId) {
        const borradorId = data.borradorId; // narrowed to number
        const [existing] = await db
          .select({
            id: ecfDocuments.id, encf: ecfDocuments.encf, codigo: ecfDocuments.codigo,
            estado: ecfDocuments.estado, lineasJson: ecfDocuments.lineasJson,
            stockDescontado: ecfDocuments.stockDescontado, almacenId: ecfDocuments.almacenId,
          })
          .from(ecfDocuments)
          .where(and(eq(ecfDocuments.id, borradorId), eq(ecfDocuments.teamId, teamId)))
          .limit(1);

        if (!existing || !['BORRADOR', 'HISTORICA'].includes(existing.estado)) {
          return NextResponse.json({ error: 'Borrador no encontrado o ya emitido' }, { status: 404 });
        }

        // Descuento solo aplica a "Guardar factura" (tipoEcf='sin-ncf', factura
        // local definitiva). "Guardar como borrador" (tipoEcf real, encf=BOR-xxx)
        // es un borrador editable pendiente de emitir — no toca stock todavía.
        const esFacturaDefinitiva = data.tipoEcf === 'sin-ncf';

        // El borrador puede haber descontado stock al guardarse la primera vez
        // (porque era sin-ncf). Si cambian las líneas, o si deja de ser
        // sin-ncf, hay que restaurar lo viejo antes de seguir.
        if (existing.stockDescontado && existing.lineasJson) {
          try {
            const lineasViejas = JSON.parse(existing.lineasJson) as Array<Record<string, unknown>>;
            const itemsViejos = lineasViejas.map(i => ({
              productoId:             i.productoId ? Number(i.productoId) : null,
              variantId:              i.variantId ? Number(i.variantId) : null,
              cantidadItem:           Number(i.cantidadItem) || 0,
              indicadorBienoServicio: (i.indicadorBienoServicio === 1 || i.indicadorBienoServicio === '1') ? 1 as const : 2 as const,
            }));
            await restaurarInventario(teamId, user.id, borradorId, existing.encf, itemsViejos, existing.almacenId ?? null);
          } catch (e) { console.error('[editar borrador] restaurar stock viejo falló', e); }
        }

        if (esFacturaDefinitiva) {
          const errorAgotado = await validarStockAgotado(teamId, data.items);
          if (errorAgotado) {
            return NextResponse.json({ error: errorAgotado }, { status: 422 });
          }
        }

        const estadoPago = calcularEstadoPago({
          estado: 'BORRADOR', tipoPago: data.tipoPago ?? 1, montoTotal: montoCts, totalPagado: 0,
        });

        const [saved] = await withRequestAuditContext(
          (tx) => tx.update(ecfDocuments).set({
            clientId:             data.clientId ?? null,
            tipoEcf:              data.tipoEcf,
            estadoPago,
            rncComprador:         data.rncComprador ?? null,
            razonSocialComprador: data.razonSocialComprador ?? null,
            emailComprador:       data.emailComprador ?? null,
            montoTotal:           montoCts,
            totalItbis:           Math.round(totales.totalItbis * 100),
            ncfModificado:        data.ncfModificado ?? null,
            categoriaGasto:       data.categoriaGasto ?? null,
            ncfProveedor:         data.ncfProveedor ?? null,
            fechaGasto:           data.fechaGasto ?? null,
            // Vínculo al padre: solo sobreescribir cuando se resolvió uno
            // (no perder el vínculo si el form no lo reenvía).
            ...(padreDoc ? { origenDocumentoId: padreDoc.id } : {}),
            codigoModificacion:   data.codigoModificacion ?? null,
            razonModificacion:    data.razonModificacion || null,
            creditoGeneradoCents,
            // Fecha custom (sin-ncf + permiso): solo sobreescribir cuando aplica,
            // para no pisar la fecha original de un borrador que se re-guarda.
            ...(fechaEmisionCustom ? { fechaEmision: fechaEmisionCustom } : {}),
            lineasJson:           data.lineasJson ?? null,
            tipoPago:             data.tipoPago ?? 1,
            fechaLimitePago:      data.fechaLimitePago ?? null,
            dependienteId:        data.dependienteId ?? null,
            dependienteNombre:    data.dependienteNombre ?? null,
            stockDescontado:      esFacturaDefinitiva,
            updatedBy:            user.id,
            updatedAt:            new Date(),
            ...extraFields,
          }).where(and(eq(ecfDocuments.id, borradorId), eq(ecfDocuments.teamId, teamId)))
            .returning(),
          { userId: user.id, teamId },
        );

        if (esFacturaDefinitiva) {
          await descontarInventario(teamId, user.id, saved.id, saved.encf, data.items, data.almacenId ?? null)
            .catch((e) => console.error('[editar borrador] descuento stock falló', e));
        }

        // Una NC reduce el saldo del padre desde que existe → recalcular su estado.
        if (data.tipoEcf === '34' && padreDoc) {
          try { await recalcularEstadoPago(padreDoc.id); } catch (e) { console.error('[emitir NC recalc padre]', e); }
        }

        // Sincronizar ledger de pagos al editar borrador.
        // DELETE + INSERT van juntos dentro de cada rama para que si el INSERT
        // falla el DELETE no haya ejecutado (evita pérdida de datos en el ledger).
        // Cuando pagoRecibido=false el usuario quitó el pago → borrar sin re-insertar.
        // Cuando pagoRecibido=true pero pagoValor=0 no tocamos el ledger; el método
        // se persiste en ecfDocuments.pagoMetodo (columna inline) y editar/page.tsx
        // lo recupera desde ahí como fallback.
        // Gasto/compra: el pago no se ata al turno (no cuenta como ingreso); la
        // salida de efectivo va como movimiento GASTO más abajo.
        const turnoPagoBorrador = esSalidaDinero ? null : turnoBorradorId;
        if (data.pagos?.length) {
          try {
            await db.delete(pagosRecibidos)
              .where(and(eq(pagosRecibidos.ecfDocumentId, borradorId), eq(pagosRecibidos.teamId, teamId)));
            await registrarPagosSplit({
              teamId,
              ecfDocumentId: borradorId,
              fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
              createdBy:     user.id,
              turnoCajaId:   turnoPagoBorrador,
              pagos: data.pagos
                .filter(p => p.valor > 0)
                .map(p => ({ montoCentavos: Math.round(p.valor * 100), metodo: p.metodo })),
            });
          } catch (e) { console.error('[editar borrador registrarPagosSplit]', e); }
        } else if (data.pagoRecibido && data.pagoValor && data.pagoValor > 0) {
          try {
            await db.delete(pagosRecibidos)
              .where(and(eq(pagosRecibidos.ecfDocumentId, borradorId), eq(pagosRecibidos.teamId, teamId)));
            await registrarPago({
              teamId,
              ecfDocumentId: borradorId,
              montoCentavos: Math.min(Math.round(data.pagoValor * 100), montoCts),
              metodo:        data.pagoMetodo || 'otro',
              cuenta:        data.pagoCuenta || null,
              fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
              createdBy:     user.id,
              turnoCajaId:   turnoPagoBorrador,
            });
          } catch (e) { console.error('[editar borrador registrarPago]', e); }
        } else if (!data.pagoRecibido) {
          // Usuario desmarcó "pago recibido" → limpiar ledger intencionalmente.
          await db.delete(pagosRecibidos)
            .where(and(eq(pagosRecibidos.ecfDocumentId, borradorId), eq(pagosRecibidos.teamId, teamId)));
        }
        // Gasto/compra: reconciliar la salida de caja con el efectivo vigente.
        // A diferencia de una venta (donde el pago SÍ va al turno), aquí el
        // documento no cuenta como ingreso; su salida se registra aparte y hay
        // que mantenerla al día si el usuario cambia el monto o quita el pago.
        if (esSalidaDinero) {
          await reconciliarSalidaBorrador({
            teamId,
            ecfDocumentId: borradorId,
            turnoActualId: turnoBorradorId,
            montoCents:    Math.min(porcionEfectivoCents(data), montoCts),
            descripcion:   `${etiquetaSalida} ${saved.encf || 'interno'}`,
            userId:        user.id,
          });
        }

        return NextResponse.json({
          ok:           true,
          modo:         'borrador',
          documentoId:  saved.id,
          encf:         saved.encf,
          estado:       'BORRADOR',
          montoTotal:   totales.montoTotal,
          pagoRecibido: data.pagoRecibido ?? false,
        });
      }

      // ── Guard idempotencia: anti doble-submit ───────────────────────────────
      // Si en los últimos 45s ya existe un borrador idéntico (mismo team, tipo,
      // comprador y monto), devolver ESE en vez de insertar otro. Cubre el
      // doble-click / reintento de red en "Guardar". La vista previa ya NO crea
      // filas (ver /api/pdf/factura/preview), así que esto solo atrapa el submit
      // real disparado dos veces.
      const dupDesde = new Date(Date.now() - 45_000);
      const dupConds = [
        eq(ecfDocuments.teamId,     teamId),
        eq(ecfDocuments.tipoEcf,    data.tipoEcf),
        eq(ecfDocuments.estado,     'BORRADOR'),
        eq(ecfDocuments.montoTotal, montoCts),
        gte(ecfDocuments.createdAt, dupDesde),
        data.clientId
          ? eq(ecfDocuments.clientId, data.clientId)
          : isNull(ecfDocuments.clientId),
      ];
      if (data.razonSocialComprador) {
        dupConds.push(eq(ecfDocuments.razonSocialComprador, data.razonSocialComprador));
      }

      // ── Nuevo borrador (INSERT) ─────────────────────────────────────────────
      // sin-ncf: encf vacío (no hay comprobante, no generar BOR-sin-ncf-XXX).
      // Otros borradores (borrador real de tipo e31/e32/etc): prefijo BOR- para
      // distinguir de e-CF reales (E31...) y evitar colisiones.
      const encfBorrador = data.tipoEcf === 'sin-ncf'
        ? ''
        : `BOR-${data.tipoEcf}-${Date.now().toString(36).toUpperCase().slice(-8)}`;

      // Descuento solo aplica a "Guardar factura" (tipoEcf='sin-ncf'). Un
      // borrador de tipo real (BOR-xxx, pendiente de emitir) no toca stock.
      const esFacturaDefinitivaNueva = data.tipoEcf === 'sin-ncf';

      if (esFacturaDefinitivaNueva) {
        const errorAgotadoNuevo = await validarStockAgotado(teamId, data.items);
        if (errorAgotadoNuevo) {
          return NextResponse.json({ error: errorAgotadoNuevo }, { status: 422 });
        }
      }

      const codigo      = await generarCodigoFactura(db, {
        teamId, userId: user.id, tipoEcf: data.tipoEcf,
        // team y user ya cargados arriba → evita 2 SELECT redundantes.
        empNombre: team?.razonSocial ?? team?.nombreComercial ?? team?.name ?? null,
        usrNombre: user.name ?? null,
        usrEmail:  user.email ?? null,
      });
      const estadoPago  = calcularEstadoPago({
        estado: 'BORRADOR', tipoPago: data.tipoPago ?? 1, montoTotal: montoCts, totalPagado: 0,
      });

      // Lock de aplicación: serializa requests idénticos para que el chequeo de
      // duplicado + el insert sean atómicos. El 2do request concurrente espera
      // aquí hasta el commit del 1ro, y entonces su SELECT lo deduplica (cierra
      // el race check-then-insert que un SELECT suelto no puede evitar).
      const dupLockKey = `borr:${teamId}:${data.tipoEcf}:${montoCts}:${data.razonSocialComprador ?? ''}:${data.clientId ?? ''}`;

      const outcome = await withRequestAuditContext(
        async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dupLockKey}))`);

          const [dup] = await tx
            .select({ id: ecfDocuments.id, encf: ecfDocuments.encf })
            .from(ecfDocuments)
            .where(and(...dupConds))
            .orderBy(desc(ecfDocuments.id))
            .limit(1);
          if (dup) return { deduped: true as const, row: dup };

          const [inserted] = await tx.insert(ecfDocuments).values({
            teamId,
            clientId:             data.clientId ?? null,
            encf:                 encfBorrador,
            codigo,
            tipoEcf:              data.tipoEcf,
            estado:               'BORRADOR',
            estadoPago,
            rncComprador:         data.rncComprador,
            razonSocialComprador: data.razonSocialComprador,
            emailComprador:       data.emailComprador,
            montoTotal:           Math.round(totales.montoTotal * 100),
            totalItbis:           Math.round(totales.totalItbis * 100),
            ncfModificado:        data.ncfModificado,
            categoriaGasto:       data.categoriaGasto,
            ncfProveedor:         data.ncfProveedor,
            fechaGasto:           data.fechaGasto,
            origenDocumentoId:    padreDoc?.id ?? null,
            codigoModificacion:   data.codigoModificacion ?? null,
            razonModificacion:    data.razonModificacion || null,
            creditoGeneradoCents,
            fechaEmision:         fechaEmisionCustom ?? new Date(),
            lineasJson:           data.lineasJson ?? null,
            tipoPago:             data.tipoPago ?? 1,
            fechaLimitePago:      data.fechaLimitePago ?? null,
            createdBy:            user.id,
            dependienteId:        data.dependienteId ?? null,
            dependienteNombre:    data.dependienteNombre ?? null,
            // Gasto/compra: el documento NO se ata al turno — si no, aparece en
            // los "Comprobantes del turno" del cierre como si fuera una venta. La
            // salida de efectivo se refleja aparte, como movimiento GASTO.
            turnoCajaId:          esSalidaDinero ? null : turnoBorradorId,
            stockDescontado:      esFacturaDefinitivaNueva,
            ...extraFields,
          }).returning();
          return { deduped: false as const, row: inserted };
        },
        { userId: user.id, teamId },
      );

      // Tracking anti-duplicados: liga la traza del form (fid/seq/botón) con el
      // documento creado o deduplicado. Para diagnosticar facturas duplicadas:
      // dos FACTURA_TRAZA con mismo docId distinto = creó duplicado; mismo fid →
      // misma pestaña (doble-submit que el dedup no atrapó); fid distinto → 2
      // pestañas / re-montaje.
      logAudit({
        teamId, userId: user.id, actor: user.email,
        action:   'FACTURA_TRAZA',
        resource: `doc:${outcome.row.id}`,
        ip:       getIp(request),
        meta: {
          ...(data._traza ?? {}),
          modo:    'borrador',
          tipo:    data.tipoEcf,
          montoCts,
          deduped: outcome.deduped,
          docId:   outcome.row.id,
        },
      });

      if (outcome.deduped) {
        return NextResponse.json({
          ok:           true,
          modo:         'borrador',
          documentoId:  outcome.row.id,
          encf:         outcome.row.encf,
          estado:       'BORRADOR',
          montoTotal:   totales.montoTotal,
          pagoRecibido: data.pagoRecibido ?? false,
          deduped:      true,
        });
      }
      const saved = outcome.row;

      // Efectos secundarios independientes tras crear el borrador → en paralelo.
      // Antes eran hasta 3 bloques await seriales (descuento de stock, recálculo
      // del padre en NC, registro de pago), cada uno 1+ round-trips a Neon. No
      // comparten datos ni tabla entre sí, así que se pueden solapar. Cada uno
      // conserva su propio catch para que un fallo no tumbe a los otros.
      // Gasto: el pago no se ata al turno (no cuenta como ingreso). La salida de
      // efectivo se registra UNA vez, tras este INSERT (ver abajo). En el UPDATE
      // de un borrador existente NO se registra, para no acumular salidas al
      // re-guardar.
      const turnoPagoBorradorNuevo = esSalidaDinero ? null : turnoBorradorId;
      await Promise.all([
        // Descuento de stock al guardar la factura definitiva (sin-ncf). El
        // borrador real (tipo e31/e32/etc, BOR-xxx) no descuenta hasta emitirse.
        esFacturaDefinitivaNueva
          ? descontarInventario(teamId, user.id, saved.id, saved.encf, data.items, data.almacenId ?? null)
              .catch((e) => console.error('[borrador nuevo] descuento stock falló', e))
          : null,
        // Una NC reduce el saldo del padre desde que existe → recalcular su estado.
        data.tipoEcf === '34' && padreDoc
          ? recalcularEstadoPago(padreDoc.id).catch((e) => console.error('[emitir NC recalc padre]', e))
          : null,
        // Pago al crear: registrar en el ledger (source of truth). Inline ya quedó
        // como seed en extraFields; registrarPago lo sincroniza desde el ledger.
        // Split: si vienen varios `pagos`, registrarPagosSplit (valida ≤ saldo y
        // recalcula estado_pago). Si no, flujo single existente.
        data.pagos?.length
          ? registrarPagosSplit({
              teamId,
              ecfDocumentId: saved.id,
              fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
              createdBy:     user.id,
              turnoCajaId:   turnoPagoBorradorNuevo,
              pagos: data.pagos
                .filter(p => p.valor > 0)
                .map(p => ({ montoCentavos: Math.round(p.valor * 100), metodo: p.metodo })),
            }).catch((e) => console.error('[emitir borrador registrarPagosSplit]', e))
          : (data.pagoRecibido && data.pagoValor && data.pagoValor > 0
              ? registrarPago({
                  teamId,
                  ecfDocumentId: saved.id,
                  montoCentavos: Math.min(Math.round(data.pagoValor * 100), Math.round(totales.montoTotal * 100)),
                  metodo:        data.pagoMetodo || 'otro',
                  cuenta:        data.pagoCuenta || null,
                  fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
                  createdBy:     user.id,
                  turnoCajaId:   turnoPagoBorradorNuevo,
                }).catch((e) => console.error('[emitir borrador registrarPago]', e))
              : null),
      ]);

      // Salida de efectivo del gasto/compra guardado como interno (borrador
      // nuevo): se registra una sola vez, aquí. El path de dedup ya retornó
      // arriba, así que esto no corre para un borrador deduplicado.
      if (esSalidaDinero) {
        await registrarSalidaGasto({
          teamId,
          turnoId:       turnoBorradorId,
          montoCents:    Math.min(porcionEfectivoCents(data), Math.round(totales.montoTotal * 100)),
          descripcion:   `${etiquetaSalida} ${saved.encf || 'interno'}`,
          userId:        user.id,
          ecfDocumentId: saved.id,
        });
      }

      // Split: la suma de los métodos (clamped al total) es el pago reportado.
      const sumaSplit = data.pagos?.length
        ? data.pagos.filter(p => p.valor > 0).reduce((s, p) => s + p.valor, 0)
        : null;
      return NextResponse.json({
        ok:           true,
        modo:         'borrador',
        documentoId:  saved.id,
        encf:         saved.encf,
        estado:       'BORRADOR',
        montoTotal:   totales.montoTotal,
        pagoRecibido: sumaSplit != null ? true : (data.pagoRecibido ?? false),
        pagoMetodo:   sumaSplit != null ? 'split' : (data.pagoRecibido ? (data.pagoMetodo ?? 'efectivo') : null),
        pagoValor:    sumaSplit != null
          ? Math.min(sumaSplit, totales.montoTotal)
          : (data.pagoRecibido ? Math.min(data.pagoValor ?? totales.montoTotal, totales.montoTotal) : null),
      });
    }

    // ── MODO EMITIR via ecf-api ────────────────────────────────────────────────

    const totales = calcularTotales(data.items);

    // ── Bloqueo stock agotado ─────────────────────────────────────────────────
    // Solo bienes con productoId. Si permiteVentaSinStock=false y stock=0 → 422.
    // Se verifica antes de consumir secuencia para no quemar un eNCF en vano.
    const bienesIds = data.items
      .filter(i => i.indicadorBienoServicio === 1 && i.productoId)
      .map(i => i.productoId as number);

    if (bienesIds.length > 0) {
      const prods = await db
        .select({
          id:                   products.id,
          nombre:               products.nombre,
          stockActual:          products.stockActual,
          controlaInventario:   products.controlaInventario,
          permiteVentaSinStock: products.permiteVentaSinStock,
        })
        .from(products)
        .where(and(eq(products.teamId, teamId), inArray(products.id, bienesIds)));

      const bloqueados = prods.filter(
        p => p.controlaInventario && p.stockActual === 0 && !p.permiteVentaSinStock,
      );

      if (bloqueados.length > 0) {
        const nombres = bloqueados.map(p => `"${p.nombre}"`).join(', ');
        return NextResponse.json(
          { error: `No se puede emitir: los siguientes productos están agotados y no permiten venta sin stock: ${nombres}.` },
          { status: 422 },
        );
      }
    }

    // ── Cuadre de caja ────────────────────────────────────────────────────────
    // Si la empresa tiene el módulo habilitado, no se puede facturar sin un turno
    // de caja ABIERTO. La venta (y sus pagos) se atan al turno para la
    // conciliación efectivo↔comprobante del cierre.
    const guardEmision = await requireTurnoAbierto(teamId, user.id, configCaja(team));
    if (!guardEmision.ok) {
      return NextResponse.json(
        { error: guardEmision.error, code: guardEmision.code },
        { status: 409 },
      );
    }
    const turnoCaja = guardEmision.turno;

    // Obtener/registrar contribuyente en ecf-api
    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      console.error('[/api/ecf/emitir ensureContribuyente]', err);
      return NextResponse.json(
        { error: 'No se pudo verificar el contribuyente en ecf-api. Verifica que el perfil esté completo.' },
        { status: 422 },
      );
    }

    // Adquirir próximo eNCF de la secuencia local SALVO que venga override
    // explícito (habilitación o tests). Emitedo es fuente de verdad del NCF;
    // ecf-api recibe el eNCF ya asignado y solo firma + envía a DGII.
    let encfAsignado: string | undefined = data.encfOverride;
    let sequenceConsumedId: number | null = null;
    let fechaVencimientoSecuencia: string | null = null;
    if (!encfAsignado) {
      const acquired = await acquireNextEncf(teamId, data.tipoEcf);
      if (!acquired) {
        return NextResponse.json(
          {
            error: `No hay secuencias disponibles para tipo ${data.tipoEcf}. ` +
                   `Verifica que tengas un rango activo y no vencido en /dashboard/secuencias.`,
          },
          { status: 422 },
        );
      }
      encfAsignado              = acquired.encf;
      sequenceConsumedId        = acquired.sequenceId;
      fechaVencimientoSecuencia = acquired.fechaVencimiento;
      console.log(`[ecf/emitir] eNCF asignado localmente: ${encfAsignado} (seq.id=${sequenceConsumedId})`);
    }

    // Mapear payload al DTO de ecf-api
    const { tipo, esRfce, dto: ecfApiDto } = mapToEcfApiDto({
      tipoEcf:                   data.tipoEcf,
      items:                     data.items,
      totales,
      rncComprador:              data.rncComprador,
      razonSocialComprador:      data.razonSocialComprador,
      emailComprador:            data.emailComprador,
      tipoPago:                  data.tipoPago,
      fechaLimitePago:           data.fechaLimitePago,
      ncfModificado:             data.ncfModificado,
      codigoModificacion:        data.codigoModificacion,
      fechaNcfModificado:        data.fechaNcfModificado,
      tipoIngresos:              data.tipoIngresos,
      retenciones:               data.retenciones, // tipos 31/32/33/34
      encfOverride:              encfAsignado,
      tasaIsrRetencion:          data.tasaIsrRetencion, // tipo 47
      fechaVencimientoSecuencia: fechaVencimientoSecuencia ?? undefined,
      skipRangeValidation,
    });

    // Ambiente DGII: NO se envía. ecf-api ya conoce el ambiente del
    // contribuyente (contrib.ambiente) y emite en el ambiente correcto.

    // ── Log server-side del body exacto que se envía a ecf-api ──────────────────
    console.log(
      `[ecf/emitir] → ecf-api | tipo=${tipo} esRfce=${esRfce} contribuyente=${codigoPublico}`,
      '\nDTO:', JSON.stringify(ecfApiDto, null, 2),
    );

    // Llamar a ecf-api — usar endpoint unificado (/emisiones/emitir)
    // ecf-api espera body wrapped: { tipoComprobante, formato?, payload: {...campos del comprobante} }
    // El mapper devuelve un DTO plano — extraemos tipoComprobante + formato y movemos el resto a `payload`.
    /**
     * Si el envío falla, guarda un BORRADOR que CONSERVA el e-NCF ya consumido.
     *
     * En esta ruta el documento se creaba solo tras emitir con éxito, así que un
     * fallo dejaba el número quemado y sin rastro en ninguna parte: el siguiente
     * intento tomaba otro y se abría un hueco permanente en la secuencia. Con el
     * borrador, el número queda visible y el reintento entra por
     * /api/facturas/[id]/emitir-ecf, que reusa el mismo e-NCF.
     *
     * Solo aplica cuando nosotros consumimos la secuencia (`sequenceConsumedId`);
     * con `encfOverride` (habilitación/tests) no se crea nada.
     */
    async function reservarBorradorTrasFallo(): Promise<number | null> {
      // Capturar en consts: TypeScript pierde el narrowing dentro del closure.
      const tid = teamId;
      const uid = user?.id;
      const enc = encfAsignado;
      if (!sequenceConsumedId || !enc || tid == null || uid == null) return null;
      try {
        const montoCts = Math.round(totales.montoTotal * 100);
        const [row] = await db
          .insert(ecfDocuments)
          .values({
            teamId:               tid,
            encf:                 enc,
            codigo:               await generarCodigoFactura(db, { teamId: tid, userId: uid, tipoEcf: data.tipoEcf }),
            tipoEcf:              data.tipoEcf,
            estado:               'BORRADOR',
            estadoPago:           calcularEstadoPago({
              estado: 'BORRADOR', tipoPago: data.tipoPago ?? 1, montoTotal: montoCts, totalPagado: 0,
            }),
            rncComprador:         data.rncComprador,
            razonSocialComprador: data.razonSocialComprador,
            emailComprador:       data.emailComprador,
            montoTotal:           montoCts,
            totalItbis:           Math.round(totales.totalItbis * 100),
            ncfModificado:        data.ncfModificado,
            origenDocumentoId:    padreDoc?.id ?? null,
            codigoModificacion:   data.codigoModificacion ?? null,
            razonModificacion:    data.razonModificacion || null,
            lineasJson:           data.lineasJson ?? JSON.stringify(data.items),
            tipoPago:             data.tipoPago ?? 1,
            fechaLimitePago:      data.fechaLimitePago ?? null,
            createdBy:            uid,
          })
          .returning({ id: ecfDocuments.id });
        console.warn(
          `[ecf/emitir] envío falló — e-NCF ${encfAsignado} RESERVADO en borrador #${row?.id}. ` +
          `El reintento debe usar /api/facturas/${row?.id}/emitir-ecf para reusar el mismo número.`,
        );
        return row?.id ?? null;
      } catch (e) {
        console.error('[ecf/emitir] no se pudo reservar el e-NCF en un borrador', e);
        return null;
      }
    }

    let resultado;
    try {
      const { tipoComprobante: tipoCmp, formato: fmt, ...payloadFields } = ecfApiDto as Record<string, unknown> & {
        tipoComprobante?: string;
        formato?: string;
      };
      const wrappedBody = {
        tipoComprobante: tipoCmp ?? tipo,
        ...(fmt ? { formato: fmt } : {}),
        payload: payloadFields,
      };
      resultado = await emision.emitirUnified(codigoPublico, wrappedBody);
    } catch (err) {
      console.error('[/api/ecf/emitir ecf-api]', err);

      if (err instanceof EcfApiError) {
        const resolved = resolveEcfApiError(err);
        const docId    = await reservarBorradorTrasFallo();
        return NextResponse.json(
          {
            error:       resolved.mensaje,
            code:        resolved.code,
            action:      docId ? 'retry-same-ncf' : resolved.action,
            statusEcfApi: err.status,
            // El e-NCF quedó reservado en este borrador: reintentar por
            // /api/facturas/{docId}/emitir-ecf reusa el MISMO número.
            ...(docId ? { docId, encf: encfAsignado } : {}),
            // DGII upstream útil para el usuario (códigos 75, 156, 181, etc.)
            ...(resolved.dgiiDetalle ? { dgii: resolved.dgiiDetalle } : {}),
            // En desarrollo incluir body crudo para debugging; en prod ocultar.
            ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: err.humanMessage } : {}),
          },
          { status: resolved.proxyStatus },
        );
      }

      // Otros errores (timeout, network, parseo, etc.) — no son EcfApiError.
      const raw = err instanceof Error ? err.message : 'Error desconocido';
      const esTimeout = /timeout|econnreset|etimedout|aborted/i.test(raw);
      const docId = await reservarBorradorTrasFallo();
      return NextResponse.json(
        {
          error: docId
            ? `${esTimeout ? 'Tiempo de espera agotado al comunicarse con el servicio de firma.' : 'No se pudo enviar el comprobante.'} ` +
              `El comprobante ${encfAsignado} quedó reservado — reintenta y se usará el mismo número.`
            : esTimeout
            ? 'Tiempo de espera agotado al comunicarse con el servicio de firma. Reintenta.'
            : 'No se pudo enviar el comprobante. Intenta de nuevo.',
          action: docId ? 'retry-same-ncf' : 'retry-later',
          ...(docId ? { docId, encf: encfAsignado } : {}),
          ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: raw } : {}),
        },
        { status: 502 },
      );
    }

    // Map ecf-api estado → emitedo estado (alineado con MAPA_ESTADOS de /api/ecf/estado)
    const mapeoEstado: Record<string, string> = {
      ACEPTADO:             'ACEPTADO',
      ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
      ENVIADO:              'EN_PROCESO',
      PENDIENTE:            'EN_PROCESO',
      RECHAZADO:            'RECHAZADO',
      ERROR:                'RECHAZADO',
    };
    const estadoUpper = String(resultado.estado ?? '').toUpperCase();
    const estadoInicial = mapeoEstado[estadoUpper] ?? (resultado.trackId ? 'EN_PROCESO' : 'ACEPTADO');
    const encf          = resultado.eNcf;
    const trackId       = resultado.trackId ?? '';

    // Validar que ecf-api respetó el eNCF que asignamos localmente.
    // Si difiere, la secuencia local quedará desincronizada y el XML firmado
    // contendrá un NCF distinto al que consumimos. Loguear para investigación.
    if (encfAsignado && encf && encf !== encfAsignado) {
      console.warn(
        `[ecf/emitir] eNCF DIVERGENTE: local=${encfAsignado} ecf-api=${encf}. ` +
        `Secuencia local pudo quedar desfasada (seq.id=${sequenceConsumedId}).`,
      );
    }

    // Guardar en BD local (auditoría + PDFs + webhooks)
    const lineasJsonParaGuardar = data.lineasJson
      ?? JSON.stringify(data.items.map(item => ({
          productoId:         item.productoId ?? null,
          variantId:          item.variantId ?? null,
          nombreItem:         item.nombreItem,
          descripcionItem:    item.descripcionItem,
          cantidadItem:       item.cantidadItem,
          precioUnitarioItem: item.precioUnitarioItem,
          descuentoMonto:     item.descuentoMonto ?? 0,
          tasaItbis:          item.tasaItbis ?? 0,
          subtotalConItbis:   item.precioUnitarioItem * item.cantidadItem * (1 + (item.tasaItbis ?? 0)),
          unidadMedida:       item.unidadMedidaItem,
          indicadorBienoServicio: item.indicadorBienoServicio ?? 2,
        })));

    const codigoEmit     = await generarCodigoFactura(db, { teamId, userId: user.id, tipoEcf: data.tipoEcf });
    const montoCtsEmit   = Math.round(totales.montoTotal * 100);
    const estadoPagoInit = calcularEstadoPago({
      estado: estadoInicial, tipoPago: data.tipoPago ?? 1, montoTotal: montoCtsEmit, totalPagado: 0,
    });

    const [saved] = await withRequestAuditContext(
      (tx) => tx.insert(ecfDocuments).values({
        teamId,
        encf,
        codigo:               codigoEmit,
        tipoEcf:              data.tipoEcf,
        estado:               estadoInicial,
        estadoPago:           estadoPagoInit,
        trackId,
        codigoSeguridad:      resultado.codigoSeguridad ?? null,
        fechaFirma:           resultado.fechaHoraFirma ?? null,
        urlVerificacion:      resultado.urlVerificacion ?? resultado.qrCodeData ?? null,
        ecfApiEmisionId:      resultado.id,
        rncComprador:         data.rncComprador,
        razonSocialComprador: data.razonSocialComprador,
        emailComprador:       data.emailComprador,
        montoTotal:           Math.round(totales.montoTotal * 100),
        totalItbis:           Math.round(totales.totalItbis * 100),
        ncfModificado:        data.ncfModificado,
        categoriaGasto:       data.categoriaGasto,
        ncfProveedor:         data.ncfProveedor,
        fechaGasto:           data.fechaGasto,
        origenDocumentoId:    padreDoc?.id ?? null,
        codigoModificacion:   data.codigoModificacion ?? null,
        razonModificacion:    data.razonModificacion || null,
        fechaEmision:         new Date(resultado.fechaEmision),
        lineasJson:           lineasJsonParaGuardar,
        tipoPago:             data.tipoPago ?? 1,
        fechaLimitePago:      data.fechaLimitePago ?? null,
        // Gasto/compra: el documento NO se ata al turno (no debe salir en los
        // "Comprobantes del turno"); su salida de efectivo va como movimiento GASTO.
        turnoCajaId:          esSalidaDinero ? null : (turnoCaja?.id ?? null),
        createdBy:            user.id,
        dependienteId:        data.dependienteId ?? null,
        dependienteNombre:    data.dependienteNombre ?? null,
        stockDescontado:      true,
        ...extraFields,
      }).returning(),
      { userId: user.id, teamId },
    );

    // Pago al emitir: registrar en el ledger (source of truth pagos_recibidos).
    // Split: si vienen varios `pagos`, registrarPagosSplit (valida ≤ saldo y
    // recalcula estado_pago). Si no, flujo single existente.
    // Gasto/compra: el pago NO se ata al turno (turnoCajaId null) para que no cuente
    // como ingreso del cierre; la salida de efectivo se registra aparte como GASTO.
    const turnoParaPago = esSalidaDinero ? null : (turnoCaja?.id ?? null);
    if (data.pagos?.length) {
      try {
        await registrarPagosSplit({
          teamId,
          ecfDocumentId: saved.id,
          fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
          createdBy:     user.id,
          turnoCajaId:   turnoParaPago,
          pagos: data.pagos
            .filter(p => p.valor > 0)
            .map(p => ({ montoCentavos: Math.round(p.valor * 100), metodo: p.metodo })),
        });
      } catch (e) { console.error('[emitir registrarPagosSplit]', e); }
    } else if (data.pagoRecibido && data.pagoValor && data.pagoValor > 0) {
      try {
        await registrarPago({
          teamId,
          ecfDocumentId: saved.id,
          montoCentavos: Math.min(Math.round(data.pagoValor * 100), Math.round(totales.montoTotal * 100)),
          metodo:        data.pagoMetodo || 'otro',
          cuenta:        data.pagoCuenta || null,
          fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
          turnoCajaId:   turnoParaPago,
          createdBy:     user.id,
        });
      } catch (e) { console.error('[emitir registrarPago]', e); }
    }

    // Salida de efectivo del gasto/compra: movimiento GASTO del turno (el cierre lo resta).
    if (esSalidaDinero) {
      await registrarSalidaGasto({
        teamId,
        turnoId:       turnoCaja?.id ?? null,
        montoCents:    Math.min(porcionEfectivoCents(data), Math.round(totales.montoTotal * 100)),
        descripcion:   `${etiquetaSalida} ${encf}`,
        userId:        user.id,
        ecfDocumentId: saved.id,
      });
    }

    // Una NC reduce el saldo del padre desde que existe → recalcular su estado.
    if (data.tipoEcf === '34' && padreDoc) {
      try { await recalcularEstadoPago(padreDoc.id); } catch (e) { console.error('[emitir NC recalc padre]', e); }
    }

    await logInfo({
      teamId,
      userId: user.id,
      source: '/api/ecf/emitir',
      message: `e-CF emitido via ecf-api: ${encf}`,
      details: { encf, tipoEcf: data.tipoEcf, trackId, montoTotal: totales.montoTotal, ecfApiId: resultado.id },
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'ECF_SEND',
      resource: encf,
      ip:       getIp(request),
      meta:     { tipoEcf: data.tipoEcf, trackId, montoTotal: totales.montoTotal, via: 'ecf-api', traza: data._traza ?? null, docId: saved.id },
    });

    // ── Descuento automático de inventario ───────────────────────────────────
    // Fire-and-forget: si falla, el e-CF ya fue emitido y guardado.
    // Solo afecta bienes (indicadorBienoServicio === 1) con productoId conocido.
    // Un gasto NO es venta de stock: no descuenta inventario.
    if (!esGasto) {
      descontarInventario(
        teamId,
        user.id,
        saved.id,
        encf,
        data.items,
        data.almacenId ?? null,
      ).catch((e) => console.error('[ecf/emitir] stock decrement failed', e));
    }

    import('@/lib/webhooks').then(({ dispatchWebhook }) =>
      dispatchWebhook(teamId, 'ecf.emitido', {
        encf, tipoEcf: data.tipoEcf, trackId, estado: estadoInicial,
        montoTotal: totales.montoTotal, documentoId: saved.id,
      })
    ).catch(() => {});

    return NextResponse.json({
      ok:              true,
      modo:            'emitir',
      encf,
      trackId,
      estado:          estadoInicial,
      codigoSeguridad: resultado.codigoSeguridad,
      montoTotal:      totales.montoTotal,
      documentoId:     saved.id,
    });

  } catch (err: unknown) {
    console.error('[/api/ecf/emitir]', err);
    await logError({
      source:  '/api/ecf/emitir',
      message: err instanceof Error ? err.message : 'Error interno',
    }).catch(() => {});
    return NextResponse.json({ error: 'Error interno al emitir' }, { status: 500 });
  }
}
