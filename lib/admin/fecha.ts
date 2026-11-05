/**
 * Fechas del panel, escritas SIEMPRE igual en el servidor y en el navegador.
 *
 * `toLocaleString('es-DO')` no sirve para lo que se pinta desde un componente de
 * cliente que también se renderiza en el servidor: Node y el navegador traen
 * versiones distintas de ICU y no coinciden en el espacio que va antes de «p. m.»
 * (uno usa un espacio fino sin salto, el otro uno normal). React lo ve como un
 * desajuste de hidratación y tira todo el árbol. Aquí solo se leen los NÚMEROS
 * (que sí coinciden) y el texto se arma a mano. Zona: la de República Dominicana
 * (UTC-4, sin horario de verano). Puro: se prueba sin navegador.
 */

const ZONA = 'America/Santo_Domingo';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
});

interface Partes { a: number; m: number; d: number; h: number; min: number }

function partes(f: Date): Partes {
  const p: Record<string, number> = {};
  for (const x of formato.formatToParts(f)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { a: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** «9:40 a. m.» */
function hora12({ h, min }: Partes): string {
  return `${h % 12 === 0 ? 12 : h % 12}:${dos(min)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const valida = (iso: string | Date): Date | null => {
  const f = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(f.getTime()) ? null : f;
};

/** «11 may 2026» */
export function fechaCorta(iso: string | Date): string {
  const f = valida(iso);
  if (!f) return '—';
  const p = partes(f);
  return `${p.d} ${MESES[p.m - 1]} ${p.a}`;
}

/** «11 may 2026, 4:12 p. m.» */
export function fechaHora(iso: string | Date): string {
  const f = valida(iso);
  if (!f) return '—';
  const p = partes(f);
  return `${p.d} ${MESES[p.m - 1]} ${p.a}, ${hora12(p)}`;
}

/** Una fecha sin hora (`2026-10-31`, como viene de una columna `date`): «31 oct 2026». No pasa por zonas horarias. */
export function fechaDeDia(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number);
  if (!a || !m || !d) return '—';
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** «hoy 9:40 a. m.», «ayer 4:15 p. m.» o «28 oct». Como `cuandoLlego` de la campana, pero estable. */
export function fechaRelativa(iso: string | Date, ahora: Date = new Date()): string {
  const f = valida(iso);
  if (!f) return '—';
  const p = partes(f);
  const hoy = partes(ahora);
  const ayer = partes(new Date(ahora.getTime() - 86_400_000));
  const mismo = (x: Partes) => x.a === p.a && x.m === p.m && x.d === p.d;
  if (mismo(hoy)) return `hoy ${hora12(p)}`;
  if (mismo(ayer)) return `ayer ${hora12(p)}`;
  return `${p.d} ${MESES[p.m - 1]}`;
}
