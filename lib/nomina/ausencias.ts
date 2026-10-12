/**
 * Faltas y licencias. Funciones puras, sin BD.
 *
 * Una ausencia es un rango de fechas. La falta y la licencia sin pago NO se pagan:
 * restan días a la corrida (el salario se prorratea por los días pagados, igual que
 * con quien entra o sale a mitad de mes). La licencia con pago se anota pero no
 * descuenta: «se le paga trabajado».
 */

export const TIPOS_AUSENCIA = ['falta', 'licencia_sin_pago', 'licencia_con_pago'] as const;
export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number];

export const LABEL_AUSENCIA: Record<TipoAusencia, string> = {
  falta: 'Falta',
  licencia_sin_pago: 'Licencia sin pago',
  licencia_con_pago: 'Licencia con pago',
};

export const esTipoAusencia = (v: unknown): v is TipoAusencia =>
  typeof v === 'string' && (TIPOS_AUSENCIA as readonly string[]).includes(v);

/** ¿Este tipo le quita días de pago? */
export const descuentaDias = (t: TipoAusencia) => t !== 'licencia_con_pago';

/** Un rango de ausencia que se descuenta. */
export interface RangoAusente { inicio: string; fin: string }

/** Tope de un rango: un año entero de licencia ya es otra cosa (suspensión, baja). */
export const AUSENCIA_DIAS_MAX = 366;
/** Tope de ausencias activas por empleado. */
export const AUSENCIAS_MAX_POR_EMPLEADO = 500;

const DIA_MS = 86_400_000;
const aUTC = (f: string) => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Días de un rango contando los dos extremos. */
export const diasEntre = (inicio: string, fin: string) => Math.round((aUTC(fin) - aUTC(inicio)) / DIA_MS) + 1;

/**
 * Días del rango `[inicio, fin]` que caen dentro de alguna ausencia que se
 * descuenta. Las ausencias pueden solaparse o venir desordenadas: cada día cuenta
 * una sola vez.
 */
export function diasAusentes(inicio: string, fin: string, ausencias: readonly RangoAusente[] | undefined): number {
  if (!ausencias || ausencias.length === 0 || fin < inicio) return 0;
  const partes = ausencias
    .map((a) => ({ i: a.inicio > inicio ? a.inicio : inicio, f: a.fin < fin ? a.fin : fin }))
    .filter((a) => a.i <= a.f)
    .sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));
  let total = 0;
  let corte: string | null = null; // último día ya contado
  for (const p of partes) {
    const desde = corte !== null && p.i <= corte ? sigDia(corte) : p.i;
    if (desde > p.f) continue;
    total += diasEntre(desde, p.f);
    if (corte === null || p.f > corte) corte = p.f;
  }
  return total;
}

function sigDia(f: string): string {
  const t = new Date(aUTC(f) + DIA_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
