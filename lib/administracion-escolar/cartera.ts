/**
 * Antigüedad de la cartera: cuánto lleva sin pagarse cada peso que se debe.
 *
 * Vive aparte de `dashboard.ts` porque ese módulo es `server-only` —abre la
 * base— y estos tramos los necesitan los dos lados: el `CASE` de Postgres que
 * suma la cartera y la tabla de deudores que se pinta en el navegador. Un
 * archivo puro es lo que permite que ambos usen los MISMOS límites; escritos
 * dos veces, bastaba mover uno para que la fila de un deudor dijera «61 a 90»
 * mientras la barra de arriba lo había contado en otro tramo.
 */

export type TramoKey = 'porVencer' | 'd1a30' | 'd31a60' | 'd61a90' | 'd90mas';

/** `desde`/`hasta` son días de atraso, ambos inclusive. `null` = sin tope. */
export const TRAMOS: readonly { key: TramoKey; label: string; desde: number | null; hasta: number | null }[] = [
  // Deuda sana: emitida y todavía dentro de plazo. Va aparte y no pegada al
  // primer tramo vencido porque juntarlas hace ver morosidad donde solo hay una
  // factura recién emitida.
  { key: 'porVencer', label: 'Por vencer',   desde: null, hasta: 0 },
  { key: 'd1a30',     label: '1 a 30 días',  desde: 1,    hasta: 30 },
  { key: 'd31a60',    label: '31 a 60 días', desde: 31,   hasta: 60 },
  { key: 'd61a90',    label: '61 a 90 días', desde: 61,   hasta: 90 },
  { key: 'd90mas',    label: 'Más de 90',    desde: 91,   hasta: null },
];

/** En qué tramo cae un atraso. Cero o negativo = todavía no vence. */
export function tramoDeAtraso(dias: number): TramoKey {
  for (const t of TRAMOS) {
    if (t.desde !== null && dias < t.desde) continue;
    if (t.hasta !== null && dias > t.hasta) continue;
    return t.key;
  }
  // Inalcanzable mientras el último tramo no tenga tope, pero un fallback
  // explícito es mejor que devolver `undefined` si alguien los reordena.
  return 'd90mas';
}

/**
 * Días de atraso de un cargo a fecha `hoy`, en fechas ISO `YYYY-MM-DD`.
 *
 * Sin vencimiento no hay atraso: el concepto con `diasParaPago = null` no vence
 * nunca, y tratarlo como vencido hoy mismo llenaría el tramo de +90 con deuda
 * que nadie está debiendo tarde.
 *
 * La resta va en UTC a propósito. Con `new Date('2026-03-01')` local, el cambio
 * de horario mete horas de más y el cargo que vence hoy sale con un día de
 * atraso —o con uno menos— según el mes.
 */
export function diasDeAtraso(fechaVencimiento: string | null | undefined, hoy: string): number {
  if (!fechaVencimiento) return 0;
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fechaVencimiento}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 86_400_000);
}
