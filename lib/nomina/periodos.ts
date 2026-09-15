/**
 * Fechas de los períodos de pago — lógica pura, sin zona horaria de por medio.
 *
 * Todas las fechas son texto 'YYYY-MM-DD' y los rangos son inclusivos en los dos
 * extremos: del 1 al 15 son 15 días. La aritmética va en UTC para que un cambio
 * de horario nunca mueva un día.
 */

export interface Rango {
  inicio: string;
  fin: string;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const DIA_MS = 86_400_000;
const aUTC = (f: string) => {
  const [y, m, d] = f.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const deUTC = (t: number) => {
  const f = new Date(t);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
};

/** ¿Es una fecha 'YYYY-MM-DD' que existe en el calendario? */
export function esFechaYMD(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** ¿Es un mes 'YYYY-MM'? */
export const esMes = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Suma días a una fecha. */
export const sumarDiasYMD = (fecha: string, dias: number) => deUTC(aUTC(fecha) + dias * DIA_MS);

/** Último día del mes 'YYYY-MM' (28 a 31). */
export function ultimoDiaDelMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Primer y último día de un mes 'YYYY-MM'. */
export function rangoDelMes(mes: string): Rango {
  return { inicio: `${mes}-01`, fin: `${mes}-${String(ultimoDiaDelMes(mes)).padStart(2, '0')}` };
}

/** Días de un rango, contando los dos extremos. */
export const diasDelRango = (r: Rango) => Math.round((aUTC(r.fin) - aUTC(r.inicio)) / DIA_MS) + 1;

/**
 * La parte del rango que cae entre `desde` y `hasta` (null = sin límite por ese
 * lado), o null si no se tocan.
 */
export function interseccion(r: Rango, desde: string | null, hasta: string | null): Rango | null {
  const inicio = desde !== null && desde > r.inicio ? desde : r.inicio;
  const fin = hasta !== null && hasta < r.fin ? hasta : r.fin;
  return inicio <= fin ? { inicio, fin } : null;
}

/**
 * En qué semana del año cae una fecha, de 1 a 52: el día 1 a 7 es la 1, el 8 a
 * 14 la 2… El año se reparte en 52 pedazos de salario, así que el día 365 (y el
 * 366) vuelve a la 1 en vez de inventar una semana 53 que pagaría de más.
 */
export function semanaDelAnio(fecha: string): number {
  const diaDelAnio = Math.round((aUTC(fecha) - Date.UTC(Number(fecha.slice(0, 4)), 0, 1)) / DIA_MS);
  return Math.floor((diaDelAnio % 364) / 7) + 1;
}

/** El lunes de la semana de una fecha. */
export function lunesDeLaSemana(fecha: string): string {
  const diaSemana = new Date(aUTC(fecha)).getUTCDay(); // 0 domingo … 6 sábado
  return sumarDiasYMD(fecha, -((diaSemana + 6) % 7));
}

/**
 * Un rango en palabras: «1 al 15 de noviembre de 2026», «29 de octubre al 4 de
 * noviembre de 2026», «28 de diciembre de 2026 al 3 de enero de 2027». En corto:
 * «1–15 nov 2026».
 */
export function rangoLegible(r: Rango, opciones: { corto?: boolean } = {}): string {
  const [yi, mi, di] = r.inicio.split('-').map(Number);
  const [yf, mf, df] = r.fin.split('-').map(Number);
  if (opciones.corto) {
    const ini = yi === yf ? (mi === mf ? `${di}` : `${di} ${MESES_CORTOS[mi - 1]}`) : `${di} ${MESES_CORTOS[mi - 1]} ${yi}`;
    return `${ini}–${df} ${MESES_CORTOS[mf - 1]} ${yf}`;
  }
  if (r.inicio === r.fin) return `${di} de ${MESES[mi - 1]} de ${yi}`;
  const ini = yi !== yf
    ? `${di} de ${MESES[mi - 1]} de ${yi}`
    : mi !== mf ? `${di} de ${MESES[mi - 1]}` : `${di}`;
  return `${ini} al ${df} de ${MESES[mf - 1]} de ${yf}`;
}

/** «noviembre de 2026» para un mes 'YYYY-MM'. */
export function mesLegible(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}
