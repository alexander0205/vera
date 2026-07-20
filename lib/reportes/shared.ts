/**
 * Capa semántica de reportes financieros — núcleo compartido.
 *
 * Idea: definir UNA vez las reglas de negocio (qué es una venta válida, qué
 * estados cuentan, cómo se bucketiza un período, cómo se parsea una línea) y
 * reusarlas en los ~20 reportes. Cada reporte de `queries.ts` compone estos
 * helpers en vez de repetir predicados SQL.
 *
 * Convenciones del proyecto respetadas:
 *  - Todos los montos header viven en CENTAVOS (integer). `lineasJson` en PESOS.
 *  - Todo query va scopeado por `teamId` (multi-tenant).
 *  - Estados de venta válidos: ACEPTADO | ACEPTADO_CONDICIONAL | EN_PROCESO.
 */
import { sql, and, eq, type SQL } from 'drizzle-orm';
import { ecfDocuments } from '@/lib/db/schema';

// ─── Constantes de dominio ───────────────────────────────────────────────────

/** Estados que representan una venta que "cuenta" (emitida y no anulada/rechazada). */
export const VENTA_ESTADOS = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'] as const;

/** Tipos e-CF que suman ingreso (factura, consumo, nota débito, regímenes esp., gubernamental). */
export const TIPOS_VENTA = ['31', '32', '33', '44', '45'] as const;

/** Nota de crédito — RESTA del ingreso. */
export const TIPO_NOTA_CREDITO = '34';

/** Etiquetas legibles de métodos de pago. */
export const METODO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
  cheque:        'Cheque',
  credito:       'Crédito',
  saldo_favor:   'Saldo a favor',
  nota_credito:  'Nota de crédito',
  otro:          'Otro',
};

/** Nombres de tipo e-CF (para labels). */
export const TIPO_ECF_NOMBRE: Record<string, string> = {
  '31': 'Factura crédito fiscal',
  '32': 'Factura consumo',
  '33': 'Nota débito',
  '34': 'Nota crédito',
  '41': 'Compra',
  '43': 'Gasto menor',
  '44': 'Régimen especial',
  '45': 'Gubernamental',
  '46': 'Exportación',
  '47': 'Pago exterior',
  'sin-ncf': 'Sin NCF (ticket)',
};

// ─── Predicados SQL reutilizables ────────────────────────────────────────────

/** Fecha calendario RD (YYYY-MM-DD) de un Date. */
function rdDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
}

/** WHERE base: team + rango de fecha de emisión.
 *
 * `fecha_emision` es un `timestamp` SIN zona que guarda la hora-pared. Comparar
 * la columna contra un `Date` corre el borde: pg serializa el Date en UTC, así
 * que `desde` (medianoche RD) llega como 04:00 y excluía los documentos fechados
 * justo a las 00:00 → se perdía el PRIMER día del rango. Filtramos por la fecha
 * calendario RD (`::date`) para un rango inclusivo día-a-día, igual que espera el
 * usuario y como se muestra en la UI. */
export function pRango(teamId: number, desde: Date, hasta: Date): SQL {
  return and(
    eq(ecfDocuments.teamId, teamId),
    sql`${ecfDocuments.fechaEmision}::date >= ${rdDate(desde)}`,
    sql`${ecfDocuments.fechaEmision}::date <= ${rdDate(hasta)}`,
  )!;
}

/** Solo estados de venta válidos (e-CF emitido a DGII). */
export const pVentaEstados: SQL = sql`${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')`;

/** Solo tipos e-CF de venta a la DGII (excluye NC y sin-ncf). */
export const pTiposVenta: SQL = sql`${ecfDocuments.tipoEcf} IN ('31', '32', '33', '44', '45')`;

/**
 * Venta que "cuenta" en reportes GERENCIALES (ingresos, por-producto, ventas
 * generales, KPIs). Incluye dos familias:
 *   1. e-CF de venta emitido a la DGII (tipos 31/32/33/44/45, estado aceptado/
 *      condicional/en-proceso), y
 *   2. tickets `sin-ncf` (venta real sin comprobante fiscal — default del POS,
 *      no va a DGII, no consume secuencia, vive en estado BORRADOR). Se cuentan
 *      mientras no estén anulados/rechazados.
 *
 * NO usar en reportes FISCALES DGII (606/607/609, ITBIS a pagar): esos deben
 * seguir con `pTiposVenta` + `pVentaEstados` porque sin-ncf no se declara.
 */
export const pVentaValida: SQL = sql`(
  (${ecfDocuments.tipoEcf} IN ('31', '32', '33', '44', '45') AND ${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'))
  OR (${ecfDocuments.tipoEcf} = 'sin-ncf' AND ${ecfDocuments.estado} NOT IN ('ANULADO', 'RECHAZADO'))
)`;

/** Es nota de crédito. */
export const pNotaCredito: SQL = eq(ecfDocuments.tipoEcf, TIPO_NOTA_CREDITO);

// ─── Períodos / bucketing ────────────────────────────────────────────────────

export type Granularidad = 'dia' | 'semana' | 'mes';

/** trunc de Postgres para agrupar por período en zona RD. */
export function truncFecha(g: Granularidad): SQL<string> {
  const unit = g === 'dia' ? 'day' : g === 'semana' ? 'week' : 'month';
  // `unit` va como LITERAL (sql.raw), NO parámetro: si se parametriza, drizzle le
  // asigna placeholders distintos en SELECT vs GROUP BY y Postgres lanza
  // "column fecha_emision must appear in the GROUP BY clause". `unit` es un enum
  // interno cerrado ('day'|'week'|'month') → sin riesgo de inyección.
  // Convertir a hora RD antes de truncar para que el "día" sea el día local.
  return sql<string>`to_char(date_trunc(${sql.raw(`'${unit}'`)}, ${ecfDocuments.fechaEmision} AT TIME ZONE 'America/Santo_Domingo'), 'YYYY-MM-DD')`;
}

/** Rango del mes actual (default de la mayoría de reportes). */
export function rangoMesActual(): { desde: Date; hasta: Date } {
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { desde, hasta };
}

/** Parsea `?desde&hasta` (YYYY-MM-DD) con fallback al mes actual. */
export function parseRango(desde?: string, hasta?: string): { desde: Date; hasta: Date } {
  const def = rangoMesActual();
  return {
    desde: desde ? new Date(desde + 'T00:00:00') : def.desde,
    hasta: hasta ? new Date(hasta + 'T23:59:59') : def.hasta,
  };
}

// ─── lineasJson (producto-nivel) ─────────────────────────────────────────────

export interface LineaParsed {
  nombre: string;
  referencia: string | null;
  cantidad: number;
  /** Ingreso de la línea CON ITBIS, en CENTAVOS. */
  totalCents: number;
  /** Ingreso de la línea SIN ITBIS (base imponible), en CENTAVOS. */
  baseCents: number;
  /** ITBIS de la línea, en CENTAVOS. */
  itbisCents: number;
}

/**
 * Parsea `lineasJson` (guardado en PESOS float) a líneas normalizadas en CENTAVOS.
 * Tolera las dos formas de nombre de campo que existen en histórico.
 */
export function parseLineas(lineasJson: string | null | undefined): LineaParsed[] {
  if (!lineasJson) return [];
  let arr: unknown;
  try { arr = JSON.parse(lineasJson); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  return arr.map((raw): LineaParsed => {
    const l = raw as Record<string, unknown>;
    const num = (v: unknown, d = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };
    const nombre     = String(l.nombreItem ?? l.nombre ?? 'Ítem');
    const referencia = (String(l.referencia ?? '').trim() || null);
    const cantidad   = num(l.cantidadItem ?? l.cantidad, 1);
    const precioU    = num(l.precioUnitarioItem ?? l.precio);
    const descuento  = num(l.descuentoMonto ?? l.descuento);
    const tasa       = num(l.tasaItbis ?? l.tasa);
    const subtotal   = num(l.subtotalConItbis ?? l.subtotal); // pesos, con ITBIS

    // base (sin ITBIS) en pesos
    const basePesos  = Math.max(0, precioU * cantidad - descuento);
    // total con ITBIS: usa subtotal guardado si existe, si no derívalo
    const totalPesos = subtotal > 0 ? subtotal : basePesos * (1 + tasa);
    const itbisPesos = Math.max(0, totalPesos - basePesos);

    return {
      nombre,
      referencia,
      cantidad,
      totalCents: Math.round(totalPesos * 100),
      baseCents:  Math.round(basePesos * 100),
      itbisCents: Math.round(itbisPesos * 100),
    };
  });
}

/** Clave de agrupación de producto: referencia (SKU) si existe, si no el nombre normalizado. */
export function claveProducto(l: LineaParsed): string {
  return l.referencia ? `ref:${l.referencia}` : `nom:${l.nombre.trim().toLowerCase()}`;
}
