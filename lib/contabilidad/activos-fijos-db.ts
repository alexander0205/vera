/**
 * Activos fijos: lo que toca la base y no es el alta ni el listado (esos están
 * en `depreciacion.ts`): dar de baja unidades con su asiento, editar la ficha
 * y abrirla sola desde una compra con categoría «activo fijo».
 *
 * Lo puro (cuánto costo y depreciación se lleva una baja, las líneas del asiento,
 * qué líneas de una compra son activos) está en `activos-fijos.ts`.
 *
 * Regla de fondo: la cuenta de activo de una ficha es SIEMPRE donde de verdad
 * está su costo en el libro. Si una compra lo llevó a una cuenta elegida a mano,
 * esa es; si se cambia a otra (por categoría), el cambio va con su asiento de
 * reclasificación en la misma transacción.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { hoyRD } from '@/lib/utils/format';
import { getConfig } from './config';
import { generarAsientoCompra, AsientoManualError } from './asientos';
import { CODIGO, asegurarCuentaBaseDetalle } from './catalogo-base';
import { insertarAsientoManualTx, validarCuentasDeAsiento } from './asiento-tx';
import { inventarioAulaDisponible, soloControlDisponible } from './activos-espacios';
import {
  activosCompletosDisponible, generarDepreciacionesPendientes, registrarActivoFijo, ActivoFijoError,
} from './depreciacion';
import {
  BajaActivoError, calcularBaja, categoriaActivo, fichasDeCompra, lineasAsientoBaja,
  type CalculoBaja, type LineaDeCompraParaActivo,
} from './activos-fijos';

const n = (v: unknown) => Number(v ?? 0);

const NO_MIGRADO = 'Esta función necesita una actualización de la base que aún no se aplica.';

async function exigirCompletos(): Promise<void> {
  if (!await activosCompletosDisponible()) throw new BajaActivoError(NO_MIGRADO, 503);
}

/**
 * Las mismas reglas que un asiento manual: cada cuenta es de la empresa, está
 * activa y acepta movimientos. Lanza `BajaActivoError` (la API la traduce a 422).
 */
export async function validarCuentasAsiento(ex: Parameters<typeof validarCuentasDeAsiento>[0], teamId: number, ids: number[]): Promise<void> {
  try {
    await validarCuentasDeAsiento(ex, teamId, ids);
  } catch (e) {
    if (e instanceof AsientoManualError) throw new BajaActivoError(e.message, 422);
    throw e;
  }
}

async function cuentaPorCodigo(teamId: number, codigo: string): Promise<number | null> {
  const f = await db.execute(sql`SELECT id FROM contabilidad_cuentas WHERE team_id = ${teamId} AND codigo = ${codigo} AND imputable AND activa LIMIT 1`);
  return (f as unknown as { id: number }[])[0]?.id ?? null;
}

/**
 * La cuenta a la que de verdad se fue el costo de una línea de compra, leída del
 * asiento de la compra: entre las candidatas (la que se eligió en la línea, la
 * configurada para «activo fijo» y 1201) la primera que tenga un débito por al
 * menos ese costo. Null si el asiento todavía no existe.
 *
 * `compraLinea` puede venir como `línea + 1000·n`: las fichas que nacen de dividir
 * una (traslado parcial de unidades) siguen atadas a su compra con esa clave, y la
 * línea real de la compra es el resto de dividir entre 1000.
 */
export async function cuentaRealDelCosto(teamId: number, compraId: number, compraLinea: number | null, costoCents: number): Promise<number | null> {
  const candidatas: number[] = [];
  if (compraLinea != null) {
    const [item] = await db.execute(sql`
      SELECT cuenta_id AS "cuentaId" FROM compras_locales_items WHERE compra_id = ${compraId} ORDER BY id OFFSET ${compraLinea % 1000} LIMIT 1`) as unknown as { cuentaId: number | null }[];
    if (item?.cuentaId) candidatas.push(item.cuentaId);
  }
  const [conf] = await db.execute(sql`
    SELECT cuenta_id AS "cuentaId" FROM contabilidad_config_gastos WHERE team_id = ${teamId} AND categoria = 'activo_fijo'`).catch(() => []) as unknown as { cuentaId: number }[];
  if (conf?.cuentaId) candidatas.push(conf.cuentaId);
  const general = await cuentaPorCodigo(teamId, CODIGO.activoFijo);
  if (general) candidatas.push(general);

  const debitos = await db.execute(sql`
    SELECT l.cuenta_id AS "cuentaId", COALESCE(sum(l.debe_cents - l.haber_cents), 0) AS monto
    FROM contabilidad_asientos x JOIN contabilidad_asiento_lineas l ON l.asiento_id = x.id
    WHERE x.team_id = ${teamId} AND x.origen_tipo = 'compra' AND x.origen_id = ${compraId}
    GROUP BY l.cuenta_id`) as unknown as { cuentaId: number; monto: unknown }[];
  const porCuenta = new Map(debitos.map((d) => [Number(d.cuentaId), n(d.monto)]));
  for (const c of candidatas) if ((porCuenta.get(c) ?? 0) >= costoCents) return c;
  return null;
}

// ── Baja ─────────────────────────────────────────────────────────────────────

/**
 * La baja es un RETIRO: saca el costo y la depreciación de esas unidades y lo que
 * valían en libros va a pérdida. No registra ventas: vender un activo lleva
 * factura electrónica (con ITBIS) y se emite en Facturación; asentar aquí el
 * cobro lo duplicaría. (La venta de activos queda como trabajo para después.)
 */
export interface BajaInput {
  teamId: number;
  userId: number;
  activoId: number;
  /** 'YYYY-MM-DD'. */
  fecha: string;
  unidades: number;
  motivo?: string | null;
}

export interface ResultadoBaja {
  bajaId: number;
  asientoId: number;
  calculo: CalculoBaja;
  /** Quedan unidades en la ficha. */
  unidadesRestantes: number;
  /** Avisos para el usuario (p. ej. se usó una cuenta alterna). */
  avisos: string[];
}

/**
 * Da de baja una o varias unidades de un activo (o todas) y asienta el retiro.
 * La ficha, la baja y el asiento se guardan juntos o no se guarda nada; el
 * candado de la fila impide que dos clics den de baja la misma unidad dos veces.
 */
export async function darDeBajaActivo(input: BajaInput): Promise<ResultadoBaja> {
  await exigirCompletos();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha) || Number.isNaN(Date.parse(`${input.fecha}T00:00:00Z`))) {
    throw new BajaActivoError('La fecha de la baja no es válida.', 400);
  }
  if (input.fecha > hoyRD()) throw new BajaActivoError('La fecha de la baja no puede ser futura.', 400);
  const motivo = input.motivo?.replace(/\s+/g, ' ').trim().slice(0, 300) || null;

  // Que las cuotas de los meses ya vencidos estén asentadas antes de repartir la depreciación.
  try {
    await generarDepreciacionesPendientes(input.teamId, input.userId);
  } catch { /* sin cuentas de depreciación configuradas: la baja se calcula con lo que haya asentado */ }

  const cfg = await getConfig(input.teamId);
  const perdidaCuenta = await asegurarCuentaBaseDetalle(input.teamId, CODIGO.perdidaActivos, input.userId);
  const gananciaCuenta = await asegurarCuentaBaseDetalle(input.teamId, CODIGO.gananciaActivos, input.userId);
  if (!perdidaCuenta || !gananciaCuenta) throw new BajaActivoError('Faltan las cuentas de pérdida y ganancia en el catálogo.', 422);
  const avisos = [perdidaCuenta.aviso, gananciaCuenta.aviso].filter((x): x is string => !!x);

  const r = await db.transaction(async (tx) => {
    const [a] = await tx.execute(sql`
      SELECT id, nombre, costo_cents AS costo, cantidad, activa, en_revision AS "enRevision",
             to_char(fecha_adquisicion, 'YYYY-MM-DD') AS adquirido, compra_id AS "compraId", compra_linea AS "compraLinea",
             cuenta_activo_id AS "cuentaActivoId", cuenta_deprec_acum_id AS "cuentaDeprecId"
      FROM contabilidad_activos_fijos WHERE id = ${input.activoId} AND team_id = ${input.teamId} FOR UPDATE`) as unknown as
      { id: number; nombre: string; costo: unknown; cantidad: number; activa: boolean; enRevision: boolean; adquirido: string; compraId: number | null; compraLinea: number | null; cuentaActivoId: number | null; cuentaDeprecId: number | null }[];
    if (!a) throw new BajaActivoError('El activo no existe.', 404);
    if (!a.activa) throw new BajaActivoError('Este activo ya está dado de baja por completo.', 409);
    if (a.enRevision) throw new BajaActivoError('Confirma primero la ficha (categoría y vida útil): viene de una compra y no está lista.', 409);
    if (input.fecha < a.adquirido) throw new BajaActivoError('La baja no puede ser anterior a la compra del activo.', 400);

    const [b] = await tx.execute(sql`
      SELECT COALESCE(sum(unidades), 0) AS unidades, COALESCE(sum(costo_baja_cents), 0) AS costo, COALESCE(sum(deprec_baja_cents), 0) AS deprec
      FROM contabilidad_activos_bajas WHERE activo_id = ${a.id} AND team_id = ${input.teamId}`) as unknown as { unidades: unknown; costo: unknown; deprec: unknown }[];
    const [d] = await tx.execute(sql`
      SELECT COALESCE(sum(monto_cents), 0) AS acumulada FROM contabilidad_depreciaciones WHERE activo_id = ${a.id} AND team_id = ${input.teamId}`) as unknown as { acumulada: unknown }[];

    const calculo = calcularBaja({
      costoVigenteCents: n(a.costo) - n(b.costo),
      acumuladaVigenteCents: n(d.acumulada) - n(b.deprec),
      cantidadVigente: a.cantidad - n(b.unidades),
    }, input.unidades, 0);

    // «Solo control» (migración 0236): su costo fue al gasto y no está en ninguna cuenta de activo, así que
    // sacar unidades no lleva asiento. Se anota la baja (para que las unidades y el costo cuadren) y listo.
    if (await soloControlDisponible()) {
      const [c] = await tx.execute(sql`SELECT solo_control AS "soloControl" FROM contabilidad_activos_fijos WHERE id = ${a.id} AND team_id = ${input.teamId}`) as unknown as { soloControl: boolean }[];
      if (c?.soloControl === true) {
        const [bc] = await tx.execute(sql`
          INSERT INTO contabilidad_activos_bajas
            (team_id, activo_id, fecha, unidades, costo_baja_cents, deprec_baja_cents, precio_venta_cents, resultado_cents, motivo, created_by)
          VALUES (${input.teamId}, ${a.id}, ${input.fecha}::date, ${calculo.unidades}, ${calculo.costoBajaCents}, 0, 0, 0, ${motivo}, ${input.userId})
          RETURNING id`) as unknown as { id: number }[];
        if (calculo.esTotal) await tx.execute(sql`UPDATE contabilidad_activos_fijos SET activa = false WHERE id = ${a.id}`);
        return { bajaId: bc.id, asientoId: 0, calculo: { ...calculo, depreciacionBajaCents: 0, valorLibrosBajaCents: 0, resultadoCents: 0 }, unidadesRestantes: a.cantidad - n(b.unidades) - calculo.unidades };
      }
    }

    // El costo se saca de donde de verdad está: la cuenta de la ficha, la que la compra usó, o la general.
    const cuentaActivo = a.cuentaActivoId
      ?? (a.compraId ? await cuentaRealDelCosto(input.teamId, a.compraId, a.compraLinea, n(a.costo)) : null)
      ?? cfg.cuentaActivoFijoId ?? await cuentaPorCodigo(input.teamId, CODIGO.activoFijo);
    const cuentaDeprec = a.cuentaDeprecId ?? cfg.cuentaDeprecAcumId ?? await cuentaPorCodigo(input.teamId, CODIGO.depreciacionAcum);
    if (!cuentaActivo || !cuentaDeprec) throw new BajaActivoError('Faltan las cuentas del activo o de su depreciación acumulada en el catálogo.', 422);

    const lineas = lineasAsientoBaja(calculo, {
      activo: cuentaActivo, deprecAcum: cuentaDeprec, cobro: null, ganancia: gananciaCuenta.id, perdida: perdidaCuenta.id,
    }, a.nombre);

    const [baja] = await tx.execute(sql`
      INSERT INTO contabilidad_activos_bajas
        (team_id, activo_id, fecha, unidades, costo_baja_cents, deprec_baja_cents, precio_venta_cents, resultado_cents, motivo, created_by)
      VALUES (${input.teamId}, ${a.id}, ${input.fecha}::date, ${calculo.unidades}, ${calculo.costoBajaCents}, ${calculo.depreciacionBajaCents},
              0, ${calculo.resultadoCents}, ${motivo}, ${input.userId})
      RETURNING id`) as unknown as { id: number }[];

    // Asiento en la MISMA transacción que la baja, con las reglas de un asiento manual.
    let asientoId: number;
    try {
      ({ asientoId } = await insertarAsientoManualTx(tx, input.teamId, {
        fecha: input.fecha,
        concepto: `Baja de activo fijo · ${a.nombre} (${calculo.unidades} ${calculo.unidades === 1 ? 'unidad' : 'unidades'})${motivo ? ` · ${motivo}` : ''}`,
        lineas,
      }, input.userId));
    } catch (e) {
      if (e instanceof AsientoManualError) throw new BajaActivoError(e.message, 422);
      throw e;
    }
    await tx.execute(sql`UPDATE contabilidad_activos_bajas SET asiento_id = ${asientoId} WHERE id = ${baja.id}`);
    if (calculo.esTotal) await tx.execute(sql`UPDATE contabilidad_activos_fijos SET activa = false WHERE id = ${a.id}`);

    return { bajaId: baja.id, asientoId, calculo, unidadesRestantes: a.cantidad - n(b.unidades) - calculo.unidades };
  });
  return { ...r, avisos };
}

// ── Editar la ficha ──────────────────────────────────────────────────────────

export interface EdicionActivo {
  nombre?: string;
  ubicacion?: string | null;
  categoria?: string | null;
  vidaUtilMeses?: number;
  valorResidualCents?: number;
  /** Confirma una ficha abierta desde una compra: desde ahí deprecia. */
  confirmar?: boolean;
  /** Aula o espacio donde está (migración 0236). `null` la deja sin aula. */
  espacioId?: number | null;
  /** bien | regular | danado (migración 0236). */
  estado?: string;
  /** Solo control de inventario: se cuenta pero no se deprecia. Solo en fichas sin cuotas ni compra. */
  soloControl?: boolean;
}

/**
 * Edita la ficha. El costo, la fecha y la cantidad no se tocan aquí: ya hay
 * asientos y cuotas montados sobre ellos. Cambiar la vida útil o el residual
 * solo cambia las cuotas que faltan; las ya asentadas se quedan.
 *
 * Cambiar de categoría cambia la cuenta del activo: con cuotas o bajas se
 * bloquea; sin ellas, el costo se pasa de la cuenta donde está a la nueva con un
 * asiento de reclasificación, siempre (también si la ficha ya estaba confirmada
 * o si se hace en dos llamadas: categoría y luego confirmar).
 */
export async function editarActivoFijo(teamId: number, userId: number, activoId: number, cambios: EdicionActivo): Promise<{ avisos: string[] }> {
  await exigirCompletos();
  const avisos: string[] = [];
  const categoria = cambios.categoria ? categoriaActivo(cambios.categoria) : null;
  if (cambios.categoria && !categoria) throw new ActivoFijoError('La categoría del activo no es válida.');

  const [a] = await db.execute(sql`
    SELECT id, costo_cents AS costo, en_revision AS "enRevision", categoria, compra_id AS "compraId", compra_linea AS "compraLinea",
           cuenta_activo_id AS "cuentaActivoId", to_char(fecha_adquisicion, 'YYYY-MM-DD') AS adquirido
    FROM contabilidad_activos_fijos WHERE id = ${activoId} AND team_id = ${teamId}`) as unknown as
    { id: number; costo: unknown; enRevision: boolean; categoria: string | null; compraId: number | null; compraLinea: number | null; cuentaActivoId: number | null; adquirido: string }[];
  if (!a) throw new ActivoFijoError('El activo no existe.');

  const sets: ReturnType<typeof sql>[] = [];
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim();
    if (!nombre) throw new ActivoFijoError('El activo necesita un nombre.');
    sets.push(sql`nombre = ${nombre.slice(0, 160)}`);
  }
  if (cambios.ubicacion !== undefined) sets.push(sql`ubicacion = ${cambios.ubicacion?.replace(/\s+/g, ' ').trim().slice(0, 160) || null}`);
  if (cambios.vidaUtilMeses !== undefined) {
    if (!Number.isInteger(cambios.vidaUtilMeses) || cambios.vidaUtilMeses <= 0) throw new ActivoFijoError('La vida útil tiene que ser de al menos un mes.');
    sets.push(sql`vida_util_meses = ${cambios.vidaUtilMeses}`);
  }
  if (cambios.valorResidualCents !== undefined) {
    if (!Number.isInteger(cambios.valorResidualCents) || cambios.valorResidualCents < 0 || cambios.valorResidualCents >= n(a.costo)) {
      throw new ActivoFijoError('El valor residual tiene que ser menor que el costo.');
    }
    sets.push(sql`valor_residual_cents = ${cambios.valorResidualCents}`);
  }

  // Aula, estado y «solo control» (migración 0236).
  if (cambios.espacioId !== undefined || cambios.estado !== undefined || cambios.soloControl !== undefined) {
    if (!await inventarioAulaDisponible()) throw new ActivoFijoError(NO_MIGRADO);
    if (cambios.espacioId !== undefined) {
      if (cambios.espacioId !== null) {
        const [e] = await db.execute(sql`SELECT id FROM escolar_espacios WHERE id = ${cambios.espacioId} AND team_id = ${teamId}`) as unknown as { id: number }[];
        if (!e) throw new ActivoFijoError('El aula no existe.');
      }
      sets.push(sql`espacio_id = ${cambios.espacioId}`);
    }
    if (cambios.estado !== undefined) {
      if (!['bien', 'regular', 'danado'].includes(cambios.estado)) throw new ActivoFijoError('El estado no es válido.');
      sets.push(sql`estado = ${cambios.estado}`);
    }
    if (cambios.soloControl !== undefined) {
      const [f] = await db.execute(sql`
        SELECT solo_control AS "soloControl", compra_id AS "compraId",
               (SELECT count(*) FROM contabilidad_depreciaciones WHERE activo_id = ${activoId} AND team_id = ${teamId})
             + (SELECT count(*) FROM contabilidad_activos_bajas WHERE activo_id = ${activoId} AND team_id = ${teamId}) AS historia
        FROM contabilidad_activos_fijos WHERE id = ${activoId} AND team_id = ${teamId}`) as unknown as { soloControl: boolean; compraId: number | null; historia: unknown }[];
      if (f && f.soloControl !== cambios.soloControl) {
        if (cambios.soloControl && (f.compraId || n(f.historia) > 0 || a.cuentaActivoId)) {
          throw new ActivoFijoError('Esta ficha ya está en las cuentas del activo fijo (viene de una compra o tiene depreciación): no puede ser de solo control.');
        }
        if (!cambios.soloControl && n(f.historia) > 0) {
          throw new ActivoFijoError('Esta ficha ya tiene bajas asentadas: su tipo no se puede cambiar.');
        }
        sets.push(sql`solo_control = ${cambios.soloControl}`);
      }
    }
  }

  let reclasificar: { deId: number; aId: number } | null = null;
  if (cambios.categoria !== undefined && (cambios.categoria ?? null) !== (a.categoria ?? null)) {
    // Con cuotas o bajas ya asentadas el cambio movería costo y depreciación a otras cuentas sin respaldo.
    const [h] = await db.execute(sql`
      SELECT (SELECT count(*) FROM contabilidad_depreciaciones WHERE activo_id = ${activoId} AND team_id = ${teamId})
           + (SELECT count(*) FROM contabilidad_activos_bajas WHERE activo_id = ${activoId} AND team_id = ${teamId}) AS historia`) as unknown as { historia: unknown }[];
    if (n(h?.historia) > 0) {
      throw new ActivoFijoError('Este activo ya tiene depreciación o bajas asentadas: su categoría no se puede cambiar sin descuadrar las cuentas.');
    }

    const cfg = await getConfig(teamId);
    const general = cfg.cuentaActivoFijoId ?? await cuentaPorCodigo(teamId, CODIGO.activoFijo);
    // Dónde está el costo hoy y dónde debe quedar.
    const real = a.compraId ? await cuentaRealDelCosto(teamId, a.compraId, a.compraLinea, n(a.costo)) : null;
    const actual = a.cuentaActivoId ?? real ?? general;
    let destino: number | null;           // cuenta que queda guardada en la ficha (null = la real o la general)
    let efectiva: number | null;          // cuenta donde queda el costo
    let cuentaDeprec: number | null = null;

    if (!categoria || categoria.clave === 'otros') {
      destino = null;
      efectiva = real ?? general;
    } else {
      const act = await asegurarCuentaBaseDetalle(teamId, categoria.cuentaActivo, userId);
      const dep = await asegurarCuentaBaseDetalle(teamId, categoria.cuentaDeprecAcum, userId);
      if (act?.aviso) avisos.push(act.aviso);
      if (dep?.aviso) avisos.push(dep.aviso);
      cuentaDeprec = dep?.id ?? null;
      // Una ficha de compra sin asiento todavía: el costo aún no está en ningún lado; no se mueve nada.
      destino = a.compraId && !real && !a.cuentaActivoId ? null : (act?.id ?? null);
      efectiva = destino ?? actual;
    }
    sets.push(sql`categoria = ${categoria?.clave ?? null}`, sql`cuenta_activo_id = ${destino}`, sql`cuenta_deprec_acum_id = ${cuentaDeprec}`);
    // Con la contabilidad apagada no se asienta nada (igual que al crear la ficha): solo cambia la ficha.
    if (cfg.activa && actual && efectiva && actual !== efectiva) reclasificar = { deId: actual, aId: efectiva };
    if (a.compraId && !real && categoria && categoria.clave !== 'otros' && !a.cuentaActivoId) {
      try { await generarAsientoCompra(teamId, a.compraId, userId); } catch { /* sigue con lo que haya */ }
    }
  }
  if (cambios.confirmar) sets.push(sql`en_revision = false`);
  if (sets.length === 0) return { avisos };

  await db.transaction(async (tx) => {
    const act = await tx.execute(sql`
      UPDATE contabilidad_activos_fijos SET ${sql.join(sets, sql`, `)}
      WHERE id = ${activoId} AND team_id = ${teamId} AND en_revision = ${a.enRevision}
        -- La ficha sigue como se leyó: dos ediciones a la vez sobre la misma lectura no reclasifican dos veces
        -- (la segunda espera, vuelve a evaluar esto, no encuentra fila y no asienta).
        AND cuenta_activo_id IS NOT DISTINCT FROM ${a.cuentaActivoId} AND categoria IS NOT DISTINCT FROM ${a.categoria}
      RETURNING id`) as unknown as unknown[];
    if (act.length === 0) throw new ActivoFijoError('La ficha cambió mientras tanto. Actualiza la pantalla.');

    if (reclasificar) {
      const costo = n(a.costo);
      try {
        await insertarAsientoManualTx(tx, teamId, {
          fecha: a.adquirido,
          concepto: 'Reclasificación de activo fijo a su categoría',
          lineas: [
            { cuentaId: reclasificar.aId, debeCents: costo, haberCents: 0, descripcion: 'Activo en su cuenta' },
            { cuentaId: reclasificar.deId, debeCents: 0, haberCents: costo, descripcion: 'Sale de la cuenta anterior' },
          ],
        }, userId);
      } catch (e) {
        if (e instanceof AsientoManualError) throw new ActivoFijoError(e.message);
        throw e;
      }
    }
  });
  return { avisos };
}

// ── Ficha desde una compra ───────────────────────────────────────────────────

/**
 * Abre la ficha de cada línea de una compra con categoría «activo fijo». Nace
 * «en revisión»: se sabe qué se compró, cuántos y cuánto costó, pero la
 * categoría y la vida útil las confirma una persona; hasta entonces no deprecia.
 * Idempotente (una línea, una ficha) y nunca estorba la compra: si algo falla se
 * anota y la compra queda como estaba.
 */
export async function crearFichasDesdeCompra(
  teamId: number, userId: number, compraId: number, fecha: string, lineas: readonly LineaDeCompraParaActivo[],
): Promise<number> {
  const fichas = fichasDeCompra(lineas);
  if (fichas.length === 0) return 0;
  try {
    if (!await activosCompletosDisponible()) return 0;
    let creadas = 0;
    for (const f of fichas) {
      const id = await registrarActivoFijo(teamId, {
        nombre: f.nombre, costoCents: f.costoCents, valorResidualCents: 0,
        // La vida útil real la pone quien confirma la ficha; 60 meses solo ocupa el campo obligatorio.
        vidaUtilMeses: 60, fechaAdquisicion: fecha, cantidad: f.cantidad,
      }, userId, { enRevision: true, compraId, compraLinea: f.linea });
      if (id) creadas++;
    }
    return creadas;
  } catch (e) {
    console.error(`[activos-fijos] no se pudo abrir la ficha de la compra ${compraId}`, e);
    return 0;
  }
}
