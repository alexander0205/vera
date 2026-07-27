/**
 * lib/contabilidad/libro-diario.ts — Leer el libro diario y generar los asientos
 * que falten. Paso 4.
 *
 * Sobre el disparo: **la generación no se engancha al flujo de emisión de
 * facturas.** Es deliberado. Meterle una escritura contable al motor de
 * facturación significa que un fallo aquí podría tumbar una emisión a la DGII,
 * y eso es intercambiar un problema grave por uno peor.
 *
 * En su lugar se barre a demanda: al abrir el libro diario y con un botón
 * explícito. Es el mismo patrón que `evaluarPromesasVencidas` en el Paso 1, y
 * con el mismo compromiso conocido: **lo que nadie abre no se asienta.** Cuando
 * haga falta que corra solo, el punto de enganche está aislado en
 * `generarAsientosPendientes()` y mudarlo a un cron es un cambio chico.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { getConfig } from './config';
import {
  generarAsientoFactura, generarAsientoPago,
  generarAsientoNotaCredito, generarAsientoAnulacion,
  generarAsientoCompra, generarAsientoGastoCaja,
  VENTA_ASENTABLE_SQL,
  type MotivoSalto,
} from './asientos';

/** Cuántos orígenes procesa un barrido. Evita que el primer uso tarde minutos. */
const TOPE_POR_BARRIDO = 200;

export interface ResumenBarrido {
  creados:   number;
  saltados:  number;
  /** Cuántos por cada motivo, para poder explicarle al usuario qué pasó. */
  motivos:   Partial<Record<MotivoSalto, number>>;
  /** true si se alcanzó el tope y quedan más por procesar. */
  hayMas:    boolean;
}

/**
 * Genera los asientos que falten, facturas primero y pagos después.
 *
 * Ese orden importa para leer el libro: el cobro de una factura no debería
 * aparecer antes que la factura misma. No es una dependencia técnica —cada
 * asiento es independiente— pero un libro diario que enseña el cobro primero se
 * lee raro.
 */
export async function generarAsientosPendientes(
  teamId: number,
  userId: number | null = null,
): Promise<ResumenBarrido> {
  const resumen: ResumenBarrido = { creados: 0, saltados: 0, motivos: {}, hayMas: false };

  const cfg = await getConfig(teamId);
  if (!cfg.activa) {
    resumen.motivos['contabilidad-apagada'] = 1;
    return resumen;
  }

  const anotar = (motivo?: MotivoSalto) => {
    resumen.saltados++;
    if (motivo) resumen.motivos[motivo] = (resumen.motivos[motivo] ?? 0) + 1;
  };

  // ── Facturas sin asiento ──────────────────────────────────────────────────
  const docs = await db.execute(sql`
    SELECT d.id
    FROM ecf_documents d
    LEFT JOIN contabilidad_asientos a
      ON a.team_id = d.team_id AND a.origen_tipo = 'factura' AND a.origen_id = d.id
    WHERE d.team_id = ${teamId}
      AND a.id IS NULL
      AND ${VENTA_ASENTABLE_SQL}
      AND d.monto_total > 0
    ORDER BY d.fecha_emision, d.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const d of docs as unknown as { id: number }[]) {
    const r = await generarAsientoFactura(teamId, d.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  // ── Notas de crédito sin asiento ──────────────────────────────────────────
  // Van después de las facturas porque una nota reduce la deuda que la factura
  // creó: leer el libro al revés confundiría.
  const notas = await db.execute(sql`
    SELECT d.id
    FROM ecf_documents d
    LEFT JOIN contabilidad_asientos a
      ON a.team_id = d.team_id AND a.origen_tipo = 'nota' AND a.origen_id = d.id
    WHERE d.team_id = ${teamId}
      AND a.id IS NULL
      AND d.tipo_ecf = '34'
      AND d.estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
      AND d.monto_total > 0
      AND d.codigo_modificacion IS DISTINCT FROM 2
    ORDER BY d.fecha_emision, d.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const n of notas as unknown as { id: number }[]) {
    const r = await generarAsientoNotaCredito(teamId, n.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  // ── Pagos sin asiento ─────────────────────────────────────────────────────
  // Ya no se excluyen saldo_favor ni nota_credito: desde el Paso 5 tienen su
  // propio asiento contra la cuenta de saldos a favor.
  const pagos = await db.execute(sql`
    SELECT p.id
    FROM pagos_recibidos p
    LEFT JOIN contabilidad_asientos a
      ON a.team_id = p.team_id AND a.origen_tipo = 'pago' AND a.origen_id = p.id
    WHERE p.team_id = ${teamId}
      AND a.id IS NULL
      AND p.monto_centavos > 0
    ORDER BY p.fecha_pago, p.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const p of pagos as unknown as { id: number }[]) {
    const r = await generarAsientoPago(teamId, p.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  // ── Anulaciones sin reversar ──────────────────────────────────────────────
  // Solo los documentos anulados que YA tenían asiento: si nunca se asentó, no
  // hay nada que reversar y el LEFT JOIN de abajo los deja fuera.
  const anulados = await db.execute(sql`
    SELECT d.id
    FROM ecf_documents d
    JOIN contabilidad_asientos orig
      ON orig.team_id = d.team_id AND orig.origen_id = d.id
     AND orig.origen_tipo IN ('factura', 'nota')
    LEFT JOIN contabilidad_asientos rev
      ON rev.team_id = d.team_id AND rev.origen_tipo = 'anulacion' AND rev.origen_id = d.id
    WHERE d.team_id = ${teamId}
      AND d.estado = 'ANULADO'
      AND rev.id IS NULL
    ORDER BY d.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const a of anulados as unknown as { id: number }[]) {
    const r = await generarAsientoAnulacion(teamId, a.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  // ── Compras locales sin asiento (nivel 3.2) ───────────────────────────────
  const compras = await db.execute(sql`
    SELECT c.id
    FROM compras_locales c
    LEFT JOIN contabilidad_asientos a
      ON a.team_id = c.team_id AND a.origen_tipo = 'compra' AND a.origen_id = c.id
    WHERE c.team_id = ${teamId}
      AND a.id IS NULL
      AND c.monto_total > 0
    ORDER BY c.fecha, c.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const c of compras as unknown as { id: number }[]) {
    const r = await generarAsientoCompra(teamId, c.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  // ── Gastos de caja sin asiento (nivel 3.2) ────────────────────────────────
  const gastos = await db.execute(sql`
    SELECT m.id
    FROM caja_movimientos m
    LEFT JOIN contabilidad_asientos a
      ON a.team_id = m.team_id AND a.origen_tipo = 'gasto_caja' AND a.origen_id = m.id
    WHERE m.team_id = ${teamId}
      AND a.id IS NULL
      AND m.tipo = 'GASTO'
      AND m.monto_centavos > 0
    ORDER BY m.created_at, m.id
    LIMIT ${TOPE_POR_BARRIDO}
  `);

  for (const g of gastos as unknown as { id: number }[]) {
    const r = await generarAsientoGastoCaja(teamId, g.id, userId);
    if (r.creado) resumen.creados++;
    else anotar(r.motivo);
  }

  resumen.hayMas = [docs, notas, pagos, anulados, compras, gastos]
    .some((s) => (s as unknown as unknown[]).length === TOPE_POR_BARRIDO);

  return resumen;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Convierte a número los montos que Postgres devuelve como texto.
 *
 * **Esto no es paranoia.** Las columnas `bigint` llegan a JS como STRING, así
 * que `0 + "701" + "0"` da `"07010"` en vez de 701: una suma de importes se
 * convierte en concatenación y el error no se nota hasta que alguien mira un
 * total absurdo. Se corta aquí, en el único sitio por donde los montos salen de
 * la base, para que nada aguas arriba tenga que acordarse.
 *
 * `bigint` se mantiene en el esquema a propósito: los centavos de un acumulado
 * anual se pasan de `int4` sin despeinarse.
 */
const aNumero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

export interface AsientoResumen {
  id:         number;
  fecha:      string;
  concepto:   string;
  origenTipo: string;
  origenId:   number;
  totalCents: number;
  lineas:     number;
}

export interface LineaDetalle {
  cuentaId:    number;
  cuentaCodigo: string;
  cuentaNombre: string;
  debeCents:   number;
  haberCents:  number;
  descripcion: string | null;
}

/** Los orígenes que admite el CHECK de `contabilidad_asientos`, y que el libro
 *  diario deja filtrar. */
export const ORIGENES = ['factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja', 'depreciacion'] as const;
export type OrigenTipo = (typeof ORIGENES)[number];

export interface FiltrosLibro {
  limit?:      number;
  offset?:     number;
  origenTipo?: OrigenTipo;
  /** Ambas en 'YYYY-MM-DD'. Inclusivas: `hasta` cuenta el día entero. */
  desde?:      string;
  hasta?:      string;
  cuentaId?:   number;
}

/**
 * Las condiciones del libro, en un solo sitio para que el listado y el total
 * las compartan.
 *
 * **Que los dos usen exactamente el mismo `WHERE` no es cosmética**: si el
 * conteo filtrara distinto que la lista, la paginación mostraría un número de
 * páginas que no existe, o escondería asientos sin decirlo. Es el mismo
 * cuidado que se tuvo con el CTE de cartera en el Paso 1.
 */
function condicionesLibro(teamId: number, f: FiltrosLibro) {
  const cond = [sql`a.team_id = ${teamId}`];

  if (f.origenTipo) cond.push(sql`a.origen_tipo = ${f.origenTipo}`);
  if (f.desde)      cond.push(sql`a.fecha >= ${f.desde}::date`);
  if (f.hasta)      cond.push(sql`a.fecha <= ${f.hasta}::date`);

  // Filtrar por cuenta mira las líneas, no el encabezado: un asiento "toca" una
  // cuenta si alguno de sus apuntes la usa. Se hace con EXISTS y no con un JOIN
  // para no duplicar el asiento cuando la cuenta aparece en dos apuntes suyos
  // (pasa: una factura con débito y crédito sobre la misma cuenta configurada).
  // El `l.team_id` va aunque el asiento ya esté acotado, para que entre por
  // `contabilidad_asiento_lineas_cuenta_idx (team_id, cuenta_id)`.
  if (f.cuentaId) {
    cond.push(sql`EXISTS (
      SELECT 1 FROM contabilidad_asiento_lineas l
      WHERE l.asiento_id = a.id AND l.team_id = ${teamId} AND l.cuenta_id = ${f.cuentaId}
    )`);
  }

  return sql.join(cond, sql` AND `);
}

export async function listarAsientos(
  teamId: number,
  opts: FiltrosLibro = {},
): Promise<{ asientos: AsientoResumen[]; total: number; sumaCents: number }> {
  const { limit = 50, offset = 0 } = opts;
  const where = condicionesLibro(teamId, opts);

  const filas = await db.execute(sql`
    SELECT a.id, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.concepto,
           a.origen_tipo AS "origenTipo", a.origen_id AS "origenId",
           a.total_cents AS "totalCents",
           (SELECT count(*)::int FROM contabilidad_asiento_lineas l
             WHERE l.asiento_id = a.id) AS lineas
    FROM contabilidad_asientos a
    WHERE ${where}
    ORDER BY a.fecha DESC, a.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // El total y la suma salen del mismo WHERE, así que cubren **todo lo
  // filtrado** y no la página que se está viendo. Fue el arreglo central de la
  // cartera en el Paso 1 y aquí aplica igual.
  const [agg] = await db.execute<{ total: number; suma: unknown }>(sql`
    SELECT count(*)::int AS total, COALESCE(sum(a.total_cents), 0)::bigint AS suma
    FROM contabilidad_asientos a
    WHERE ${where}
  `);

  const asientos = (filas as unknown as AsientoResumen[]).map((a) => ({
    ...a,
    totalCents: aNumero(a.totalCents),
    lineas:     aNumero(a.lineas),
  }));

  return { asientos, total: aNumero(agg.total), sumaCents: aNumero(agg.suma) };
}

/**
 * Las cuentas que de verdad aparecen en algún asiento, para el desplegable del
 * filtro.
 *
 * Se listan solo esas y no el catálogo entero (30+ cuentas, la mayoría sin usar)
 * porque un filtro que ofrece opciones que devuelven cero resultados hace dudar
 * al usuario de si el reporte está roto.
 */
/** Una fila plana del libro diario para exportar: un apunte con su encabezado. */
export interface FilaExportLibro {
  fecha:        string;
  concepto:     string;
  origenTipo:   string;
  cuentaCodigo: string;
  cuentaNombre: string;
  descripcion:  string | null;
  debeCents:    number;
  haberCents:   number;
}

/**
 * El libro diario aplanado a una fila por apunte, con los MISMOS filtros que la
 * pantalla (via `condicionesLibro`), para exportarlo a Excel.
 *
 * A diferencia de `listarAsientos`, que devuelve un resumen por asiento para la
 * lista paginada, aquí baja cada línea con su cuenta: es el formato columnar con
 * el que un contador lee un libro diario impreso (fecha · asiento · cuenta ·
 * debe · haber). Sin paginar: exporta todo lo filtrado.
 */
export async function asientosParaExportar(
  teamId: number,
  opts: FiltrosLibro = {},
): Promise<FilaExportLibro[]> {
  const where = condicionesLibro(teamId, opts);
  const filas = await db.execute(sql`
    SELECT to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.concepto,
           a.origen_tipo AS "origenTipo",
           c.codigo AS "cuentaCodigo", c.nombre AS "cuentaNombre",
           l.descripcion,
           l.debe_cents AS "debeCents", l.haber_cents AS "haberCents"
    FROM contabilidad_asientos a
    JOIN contabilidad_asiento_lineas l ON l.asiento_id = a.id
    JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
    WHERE ${where}
    ORDER BY a.fecha DESC, a.id DESC, l.orden ASC
  `);
  return (filas as unknown as FilaExportLibro[]).map((f) => ({
    ...f,
    debeCents:  aNumero(f.debeCents),
    haberCents: aNumero(f.haberCents),
  }));
}

export async function cuentasConMovimientos(
  teamId: number,
): Promise<{ id: number; codigo: string; nombre: string }[]> {
  const filas = await db.execute(sql`
    SELECT DISTINCT c.id, c.codigo, c.nombre
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
    WHERE l.team_id = ${teamId}
    ORDER BY c.codigo
  `);
  return filas as unknown as { id: number; codigo: string; nombre: string }[];
}

export async function getLineasAsiento(
  teamId: number,
  asientoId: number,
): Promise<LineaDetalle[]> {
  const filas = await db.execute(sql`
    SELECT l.cuenta_id AS "cuentaId", c.codigo AS "cuentaCodigo", c.nombre AS "cuentaNombre",
           l.debe_cents AS "debeCents", l.haber_cents AS "haberCents", l.descripcion
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
    WHERE l.team_id = ${teamId} AND l.asiento_id = ${asientoId}
    ORDER BY l.orden
  `);
  return (filas as unknown as LineaDetalle[]).map((l) => ({
    ...l,
    debeCents:  aNumero(l.debeCents),
    haberCents: aNumero(l.haberCents),
  }));
}

/**
 * Cuántos orígenes existen sin asiento. Para que la pantalla pueda decir
 * "faltan 12" en vez de obligar a barrer para averiguarlo.
 */
export async function contarPendientes(teamId: number): Promise<number> {
  const [{ total }] = await db.execute<{ total: number }>(sql`
    SELECT (
      -- Facturas y notas de débito (incluida la mora)
      (SELECT count(*) FROM ecf_documents d
        LEFT JOIN contabilidad_asientos a
          ON a.team_id = d.team_id AND a.origen_tipo = 'factura' AND a.origen_id = d.id
        WHERE d.team_id = ${teamId} AND a.id IS NULL
          AND d.estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
          AND d.tipo_ecf IN ('31', '32', '33', '44', '45')
          AND d.monto_total > 0)
      +
      -- Notas de crédito con efecto monetario
      (SELECT count(*) FROM ecf_documents d
        LEFT JOIN contabilidad_asientos a
          ON a.team_id = d.team_id AND a.origen_tipo = 'nota' AND a.origen_id = d.id
        WHERE d.team_id = ${teamId} AND a.id IS NULL
          AND d.tipo_ecf = '34'
          AND d.estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
          AND d.monto_total > 0
          AND d.codigo_modificacion IS DISTINCT FROM 2)
      +
      -- Cobros, incluidos los que aplican un saldo a favor
      (SELECT count(*) FROM pagos_recibidos p
        LEFT JOIN contabilidad_asientos a
          ON a.team_id = p.team_id AND a.origen_tipo = 'pago' AND a.origen_id = p.id
        WHERE p.team_id = ${teamId} AND a.id IS NULL
          AND p.monto_centavos > 0)
      +
      -- Anulaciones de documentos que ya estaban asentados
      (SELECT count(*) FROM ecf_documents d
        JOIN contabilidad_asientos orig
          ON orig.team_id = d.team_id AND orig.origen_id = d.id
         AND orig.origen_tipo IN ('factura', 'nota')
        LEFT JOIN contabilidad_asientos rev
          ON rev.team_id = d.team_id AND rev.origen_tipo = 'anulacion' AND rev.origen_id = d.id
        WHERE d.team_id = ${teamId} AND d.estado = 'ANULADO' AND rev.id IS NULL)
    )::int AS total
  `);
  return total;
}

/**
 * Comprobación de integridad del libro: ningún asiento puede tener debe ≠ haber.
 *
 * La aplicación ya lo impide al insertar, así que esto debería devolver siempre
 * cero. Existe justamente para eso: si algún día devuelve algo, hay un bug y se
 * ve antes de que contamine un reporte.
 */
export async function verificarCuadre(teamId: number): Promise<{
  asientosDescuadrados: { id: number; concepto: string; debe: number; haber: number }[];
}> {
  const filas = await db.execute(sql`
    SELECT a.id, a.concepto,
           COALESCE(sum(l.debe_cents), 0)::bigint  AS debe,
           COALESCE(sum(l.haber_cents), 0)::bigint AS haber
    FROM contabilidad_asientos a
    LEFT JOIN contabilidad_asiento_lineas l ON l.asiento_id = a.id
    WHERE a.team_id = ${teamId}
    GROUP BY a.id, a.concepto
    HAVING COALESCE(sum(l.debe_cents), 0) <> COALESCE(sum(l.haber_cents), 0)
  `);
  const descuadrados = (filas as unknown as
    { id: number; concepto: string; debe: unknown; haber: unknown }[])
    .map((f) => ({ ...f, debe: aNumero(f.debe), haber: aNumero(f.haber) }));

  return { asientosDescuadrados: descuadrados };
}
