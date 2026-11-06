/**
 * lib/contabilidad/inventario-asientos.ts — El inventario en el libro.
 *
 *   Venta de mercancía        Dr 5101 Costo de ventas      / Cr 1105 Inventario
 *   Devolución o anulación    Dr 1105 Inventario           / Cr 5101 Costo de ventas
 *   Merma (ajuste salida)     Dr 5102 Mermas y sobrantes   / Cr 1105
 *   Sobrante / entrada suelta Dr 1105                      / Cr 5102
 *   Stock inicial             Dr 1105                      / Cr 3102 Resultados acumulados
 *
 * ── Cómo se asienta ─────────────────────────────────────────────────────────
 * Igual que las facturas: NO se engancha a la emisión (un fallo contable no
 * puede tumbar una venta). Cada movimiento de stock guarda la foto de su costo
 * (`costo_total_cents`) y el barrido (`generarAsientosPendientes`, el cron y el
 * botón del libro diario) asienta los que no tienen `asiento_id`.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 *  - El movimiento se marca (`asiento_id`) en la MISMA transacción que crea el
 *    asiento: o salen los dos o ninguno.
 *  - Un lote es «todos los movimientos pendientes de un documento y de un
 *    sentido (venta / devolución)». Su origen_id es el id del movimiento más
 *    bajo del lote, único por construcción; el índice único
 *    (team, origen_tipo, origen_id) frena cualquier reintento.
 *  - Un candado por empresa serializa dos barridos simultáneos.
 *  - Los movimientos sin foto de costo (histórico, compras, productos sin
 *    costo) no se asientan nunca: el cuadre del valor del inventario cubre lo
 *    anterior (ver `inventario-valuacion.ts`).
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { getConfig } from './config';
import { asegurarCuentaBase, CODIGO } from './catalogo-base';
import { VENTA_ASENTABLE_SQL, type ResultadoGeneracion } from './asientos';
import {
  partidasCostoVenta, partidasAjusteInventario, type CuentasInventario, type MovimientoParaAsiento,
} from '@/lib/inventario/costo';
import type { LineaAsiento } from './asientos';

type Ejecutor = Pick<typeof db, 'execute'>;

const num = (v: unknown) => Number(v ?? 0);

/** Fecha en RD de un `timestamp` sin zona guardado en UTC. */
const FECHA_RD = (col: string) => `(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santo_Domingo')::date`;

/** Tipos de ajuste que se asientan uno por uno. */
export const TIPOS_AJUSTE_ASENTABLES = ['AJUSTE_SALIDA', 'AJUSTE_ENTRADA', 'ENTRADA', 'STOCK_INICIAL'] as const;

// ─── Cuentas ─────────────────────────────────────────────────────────────────

async function cuentaDeCodigo(teamId: number, codigo: string): Promise<number | null> {
  const filas = await db.execute(sql`
    SELECT id FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND codigo = ${codigo} AND imputable AND activa LIMIT 1`) as unknown as { id: number }[];
  return filas[0]?.id ?? (await asegurarCuentaBase(teamId, codigo));
}

export async function cuentaInventario(teamId: number): Promise<number | null> {
  const cfg = await getConfig(teamId);
  return cfg.cuentaInventarioId ?? await cuentaDeCodigo(teamId, CODIGO.inventario);
}

/** Resuelve solo las cuentas que hacen falta; las demás quedan en 0. */
async function cuentasPara(teamId: number, necesita: ('costoVentas' | 'mermas' | 'apertura')[]): Promise<CuentasInventario | { motivo: 'sin-cuenta-inventario' | 'sin-cuenta-costo-ventas' | 'sin-cuenta-mermas' | 'sin-cuenta-resultados-acumulados' }> {
  const inventarioId = await cuentaInventario(teamId);
  if (!inventarioId) return { motivo: 'sin-cuenta-inventario' };
  const c: CuentasInventario = { inventarioId, costoVentasId: 0, mermasId: 0, aperturaId: 0 };
  if (necesita.includes('costoVentas')) {
    const id = await cuentaDeCodigo(teamId, CODIGO.costoVentas);
    if (!id) return { motivo: 'sin-cuenta-costo-ventas' };
    c.costoVentasId = id;
  }
  if (necesita.includes('mermas')) {
    const id = await cuentaDeCodigo(teamId, CODIGO.mermasInventario);
    if (!id) return { motivo: 'sin-cuenta-mermas' };
    c.mermasId = id;
  }
  if (necesita.includes('apertura')) {
    const id = await cuentaDeCodigo(teamId, CODIGO.resultadosAcumulados);
    if (!id) return { motivo: 'sin-cuenta-resultados-acumulados' };
    c.aperturaId = id;
  }
  return c;
}

// ─── Candidatos (el barrido y el conteo usan lo mismo) ───────────────────────

/**
 * Documentos cuyo costo se asienta: ventas vivas (el mismo criterio que el
 * asiento de la factura) y anulados (su salida y su devolución se ven los dos).
 * Una nota de crédito nunca: su movimiento no es una venta.
 */
const DOC_CON_COSTO = sql`(
  ${VENTA_ASENTABLE_SQL}
  OR (d.estado = 'ANULADO' AND d.tipo_ecf IN ('31', '32', '33', '44', '45', 'sin-ncf'))
)`;

function candidatosCostoVenta(teamId: number, tipo: 'VENTA' | 'DEVOLUCION') {
  const devolucion = tipo === 'DEVOLUCION';
  return sql`
    FROM inventory_movements m
    JOIN ecf_documents d ON d.id = m.referencia_id AND d.team_id = m.team_id
    WHERE m.team_id = ${teamId}
      AND m.tipo = ${tipo}
      AND m.asiento_id IS NULL
      AND m.costo_total_cents IS NOT NULL
      AND ${DOC_CON_COSTO}
      ${devolucion ? sql`AND EXISTS (
        SELECT 1 FROM inventory_movements v
        WHERE v.team_id = m.team_id AND v.referencia_id = m.referencia_id
          AND v.tipo = 'VENTA' AND v.asiento_id IS NOT NULL)` : sql``}
    GROUP BY m.referencia_id${devolucion ? sql`, ${sql.raw(FECHA_RD('m.created_at'))}` : sql``}`;
}

/** Ids (el menor de cada lote) de los lotes de costo de venta pendientes. */
export async function lotesCostoVentaPendientes(teamId: number, tipo: 'VENTA' | 'DEVOLUCION', limite: number): Promise<{ id: number }[]> {
  const filas = await db.execute(sql`
    SELECT min(m.id)::int AS id ${candidatosCostoVenta(teamId, tipo)}
    ORDER BY min(m.id) LIMIT ${limite}`) as unknown as { id: number }[];
  return filas;
}

export async function ajustesPendientes(teamId: number, limite: number): Promise<{ id: number }[]> {
  return await db.execute(sql`
    SELECT m.id FROM inventory_movements m
    WHERE m.team_id = ${teamId} AND m.asiento_id IS NULL AND m.costo_total_cents IS NOT NULL
      AND m.tipo IN (${sql.join(TIPOS_AJUSTE_ASENTABLES.map((t) => sql`${t}`), sql`, `)})
    ORDER BY m.id LIMIT ${limite}`) as unknown as { id: number }[];
}

/** Cuántos asientos de inventario faltan: lotes de venta + lotes de devolución + ajustes. */
export async function contarPendientesInventario(teamId: number): Promise<{ costos_venta: number; ajustes_inventario: number }> {
  const [f] = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM (SELECT 1 ${candidatosCostoVenta(teamId, 'VENTA')}) x)::int
      + (SELECT count(*) FROM (SELECT 1 ${candidatosCostoVenta(teamId, 'DEVOLUCION')}) y)::int AS costos_venta,
      (SELECT count(*) FROM inventory_movements m
        WHERE m.team_id = ${teamId} AND m.asiento_id IS NULL AND m.costo_total_cents IS NOT NULL
          AND m.tipo IN (${sql.join(TIPOS_AJUSTE_ASENTABLES.map((t) => sql`${t}`), sql`, `)}))::int AS ajustes_inventario`) as unknown as { costos_venta: unknown; ajustes_inventario: unknown }[];
  return { costos_venta: num(f?.costos_venta), ajustes_inventario: num(f?.ajustes_inventario) };
}

// ─── Escritura ───────────────────────────────────────────────────────────────

async function insertarAsientoDeMovimientos(
  tx: Ejecutor,
  teamId: number,
  datos: { fecha: string; concepto: string; origenTipo: string; origenId: number },
  lineas: LineaAsiento[],
  movimientoIds: number[],
  userId: number | null,
): Promise<number | null> {
  const debe = lineas.reduce((s, l) => s + l.debeCents, 0);
  const haber = lineas.reduce((s, l) => s + l.haberCents, 0);
  if (debe !== haber || debe === 0) throw new Error(`Asiento de inventario descuadrado en "${datos.concepto}": debe ${debe} ≠ haber ${haber}`);

  const filas = await tx.execute(sql`
    INSERT INTO contabilidad_asientos (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
    VALUES (${teamId}, ${datos.fecha}, ${datos.concepto.slice(0, 255)}, ${datos.origenTipo}, ${datos.origenId}, ${debe}, ${userId})
    ON CONFLICT (team_id, origen_tipo, origen_id) DO NOTHING
    RETURNING id`) as unknown as { id: number }[];
  const asientoId = filas[0]?.id;
  if (!asientoId) return null;
  let orden = 0;
  for (const l of lineas) {
    await tx.execute(sql`
      INSERT INTO contabilidad_asiento_lineas (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
      VALUES (${asientoId}, ${teamId}, ${l.cuentaId}, ${l.debeCents}, ${l.haberCents}, ${l.descripcion.slice(0, 255)}, ${orden++})`);
  }
  // Marcar los movimientos en la misma transacción: si otro los marcó antes, se deshace todo.
  const marcados = await tx.execute(sql`
    UPDATE inventory_movements SET asiento_id = ${asientoId}
    WHERE team_id = ${teamId} AND asiento_id IS NULL
      AND id IN (${sql.join(movimientoIds.map((i) => sql`${i}`), sql`, `)})
    RETURNING id`) as unknown as { id: number }[];
  if (marcados.length !== movimientoIds.length) {
    throw new Error('Los movimientos de inventario cambiaron mientras se asentaban; se reintenta en el próximo barrido.');
  }
  return asientoId;
}

/**
 * Asienta el costo de un lote de ventas (o devoluciones) de un documento.
 * `movimientoId` es cualquiera del lote; se asienta el lote entero.
 */
export async function generarAsientoCostoVenta(
  teamId: number,
  movimientoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const [m] = await db.execute(sql`
    SELECT referencia_id AS "docId", tipo, asiento_id AS "asientoId", costo_total_cents AS costo
    FROM inventory_movements WHERE team_id = ${teamId} AND id = ${movimientoId}`) as unknown as
    { docId: number | null; tipo: string; asientoId: number | null; costo: unknown }[];
  if (!m || (m.tipo !== 'VENTA' && m.tipo !== 'DEVOLUCION') || !m.docId || m.costo == null) return { creado: false, motivo: 'no-es-venta' };
  if (m.asientoId) return { creado: false, motivo: 'ya-tiene-asiento' };

  const cuentas = await cuentasPara(teamId, ['costoVentas']);
  if ('motivo' in cuentas) return { creado: false, motivo: cuentas.motivo };

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('inventario_asientos'), ${teamId})`);

    const [doc] = await tx.execute(sql`
      SELECT COALESCE(NULLIF(d.encf, ''), d.codigo) AS encf, d.estado, d.tipo_ecf AS "tipoEcf",
             to_char(d.fecha_emision AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fecha
      FROM ecf_documents d WHERE d.team_id = ${teamId} AND d.id = ${m.docId}`) as unknown as
      { encf: string | null; estado: string; tipoEcf: string; fecha: string }[];
    if (!doc) return { creado: false, motivo: 'no-es-venta' as const };

    const devolucion = m.tipo === 'DEVOLUCION';
    if (devolucion) {
      const [v] = await tx.execute(sql`
        SELECT 1 AS ok FROM inventory_movements
        WHERE team_id = ${teamId} AND referencia_id = ${m.docId} AND tipo = 'VENTA' AND asiento_id IS NOT NULL LIMIT 1`) as unknown as { ok: number }[];
      if (!v) return { creado: false, motivo: 'sin-asiento-que-reversar' as const };
    }

    // El lote: todo lo pendiente de este documento y sentido (y del mismo día RD si es devolución).
    const lote = await tx.execute(sql`
      SELECT m.id, m.costo_total_cents AS costo, p.nombre,
             to_char(${sql.raw(FECHA_RD('m.created_at'))}, 'YYYY-MM-DD') AS fecha
      FROM inventory_movements m JOIN products p ON p.id = m.producto_id
      WHERE m.team_id = ${teamId} AND m.referencia_id = ${m.docId} AND m.tipo = ${m.tipo}
        AND m.asiento_id IS NULL AND m.costo_total_cents IS NOT NULL
        ${devolucion ? sql`AND ${sql.raw(FECHA_RD('m.created_at'))} = (
          SELECT ${sql.raw(FECHA_RD('x.created_at'))} FROM inventory_movements x WHERE x.id = ${movimientoId})` : sql``}
      ORDER BY m.id
      FOR UPDATE OF m`) as unknown as { id: number; costo: unknown; nombre: string; fecha: string }[];
    if (lote.length === 0) return { creado: false, motivo: 'ya-tiene-asiento' as const };

    const movs: MovimientoParaAsiento[] = lote.map((l) => ({ tipo: m.tipo, costoTotalCents: num(l.costo), descripcion: l.nombre }));
    const partidas = partidasCostoVenta(movs, cuentas);
    if (partidas.length === 0) return { creado: false, motivo: 'sin-monto' as const };

    const ref = doc.encf ?? String(m.docId);
    const asientoId = await insertarAsientoDeMovimientos(tx, teamId, {
      fecha: devolucion ? lote[0].fecha : doc.fecha,
      concepto: devolucion ? `Costo devuelto · ${ref}` : `Costo de ventas · ${ref}`,
      origenTipo: 'costo_venta',
      origenId: lote[0].id,
    }, partidas, lote.map((l) => l.id), userId);
    return asientoId === null ? { creado: false, motivo: 'ya-tiene-asiento' as const } : { creado: true, asientoId };
  });
}

const ETIQUETA_AJUSTE: Record<string, string> = {
  AJUSTE_SALIDA: 'Merma',
  AJUSTE_ENTRADA: 'Sobrante',
  ENTRADA: 'Entrada de mercancía',
  STOCK_INICIAL: 'Stock inicial',
};

/** Asienta un ajuste manual de stock (merma, sobrante, entrada suelta o stock inicial). */
export async function generarAsientoAjusteInventario(
  teamId: number,
  movimientoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const [m] = await db.execute(sql`
    SELECT m.tipo, m.asiento_id AS "asientoId", m.costo_total_cents AS costo, m.motivo, p.nombre,
           to_char(${sql.raw(FECHA_RD('m.created_at'))}, 'YYYY-MM-DD') AS fecha
    FROM inventory_movements m JOIN products p ON p.id = m.producto_id
    WHERE m.team_id = ${teamId} AND m.id = ${movimientoId}`) as unknown as
    { tipo: string; asientoId: number | null; costo: unknown; motivo: string | null; nombre: string; fecha: string }[];
  if (!m || !(TIPOS_AJUSTE_ASENTABLES as readonly string[]).includes(m.tipo) || m.costo == null) return { creado: false, motivo: 'no-es-venta' };
  if (m.asientoId) return { creado: false, motivo: 'ya-tiene-asiento' };
  const valor = num(m.costo);
  if (valor <= 0) return { creado: false, motivo: 'sin-monto' };

  const cuentas = await cuentasPara(teamId, m.tipo === 'STOCK_INICIAL' ? ['apertura'] : ['mermas']);
  if ('motivo' in cuentas) return { creado: false, motivo: cuentas.motivo };

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('inventario_asientos'), ${teamId})`);
    const [vivo] = await tx.execute(sql`
      SELECT 1 AS ok FROM inventory_movements WHERE team_id = ${teamId} AND id = ${movimientoId} AND asiento_id IS NULL FOR UPDATE`) as unknown as { ok: number }[];
    if (!vivo) return { creado: false, motivo: 'ya-tiene-asiento' as const };

    const concepto = `${ETIQUETA_AJUSTE[m.tipo]} · ${m.nombre}${m.motivo ? ` (${m.motivo})` : ''}`;
    const asientoId = await insertarAsientoDeMovimientos(tx, teamId, {
      fecha: m.fecha, concepto, origenTipo: 'ajuste_inventario', origenId: movimientoId,
    }, partidasAjusteInventario(m.tipo, valor, `${ETIQUETA_AJUSTE[m.tipo]} · ${m.nombre}`, cuentas), [movimientoId], userId);
    return asientoId === null ? { creado: false, motivo: 'ya-tiene-asiento' as const } : { creado: true, asientoId };
  });
}

/**
 * Asienta solo lo de inventario (sin el barrido completo): lo usa la pantalla
 * «Valor del inventario» para que el saldo de 1105 que muestra ya incluya las
 * ventas y ajustes recientes. Un movimiento que falla no frena a los demás.
 */
export async function asentarPendientesInventario(teamId: number, userId: number | null = null): Promise<{ creados: number; fallidos: number }> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creados: 0, fallidos: 0 };
  let creados = 0, fallidos = 0;
  const correr = async (ids: { id: number }[], f: (id: number) => Promise<ResultadoGeneracion>) => {
    for (const { id } of ids) {
      try { if ((await f(id)).creado) creados++; } catch (e) { fallidos++; console.error(`[inventario] movimiento ${id} del team ${teamId} no se pudo asentar:`, e); }
    }
  };
  await correr(await lotesCostoVentaPendientes(teamId, 'VENTA', 200), (id) => generarAsientoCostoVenta(teamId, id, userId));
  await correr(await lotesCostoVentaPendientes(teamId, 'DEVOLUCION', 200), (id) => generarAsientoCostoVenta(teamId, id, userId));
  await correr(await ajustesPendientes(teamId, 200), (id) => generarAsientoAjusteInventario(teamId, id, userId));
  return { creados, fallidos };
}
