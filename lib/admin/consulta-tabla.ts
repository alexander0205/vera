/**
 * Lo que una tabla del panel pide en la URL (`?pagina=2&orden=nombre:asc&q=…`),
 * validado contra lo que esa tabla permite. PURO y sin base de datos.
 *
 * Es el único lugar por donde entra texto de la barra de direcciones a una
 * consulta, y por eso es estricto:
 *   · el CAMPO de orden sale de una lista blanca (nunca se arma un ORDER BY con
 *     lo que llegó);
 *   · el tamaño de página solo puede ser uno de los permitidos;
 *   · cada filtro tiene un tipo (`opciones`, `entero`, `fecha`) y lo que no
 *     cumple se descarta en silencio en vez de llegar a la base;
 *   · la búsqueda se recorta y se le escapan `%`, `_` y `\` para el ILIKE.
 * Los valores igual viajan como parámetros; esto cierra lo que los parámetros
 * no cubren (nombres de columna, tamaños sin tope, patrones de búsqueda).
 */

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;
export const TAMANO_POR_DEFECTO = 25;
export const TOPE_EXPORTACION = 20_000;
export const LARGO_MAXIMO_BUSQUEDA = 100;

export type DefFiltro =
  | { tipo: 'opciones'; opciones: readonly string[] }
  /** Una clave corta (`plan`, `estado de suscripción`): letras, números, `_`, `-` y `.`. */
  | { tipo: 'clave' }
  | { tipo: 'entero' }
  | { tipo: 'fecha' };

export interface DefTabla {
  /** Campos por los que se puede ordenar (los nombres que usa la tabla, no los de la base). */
  ordenables: readonly string[];
  porDefecto: { campo: string; dir: 'asc' | 'desc' };
  filtros: Record<string, DefFiltro>;
  /**
   * Filtros que valen cuando la URL no dice nada (p. ej. tareas: «pendientes»).
   * Para ver todo, la URL lo dice con un valor propio de esa tabla.
   */
  filtrosPorDefecto?: Record<string, string>;
}

export interface ConsultaTabla {
  /** Desde 1. */
  pagina: number;
  tamano: number;
  orden: { campo: string; dir: 'asc' | 'desc' };
  /** Búsqueda ya recortada (sin escapar: ver `patronBusqueda`). */
  q: string;
  filtros: Record<string, string>;
}

type ParamsCrudos = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es una fecha real? `2026-02-31` pasa la forma y no el calendario. */
export function esFechaValida(s: string): boolean {
  if (!FECHA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function leerConsulta(params: ParamsCrudos, def: DefTabla): ConsultaTabla {
  const pagina = Math.min(Math.max(parseInt(uno(params.pagina) ?? '1', 10) || 1, 1), 100_000);

  const t = parseInt(uno(params.tamano) ?? '', 10);
  const tamano = (TAMANOS_PAGINA as readonly number[]).includes(t) ? t : TAMANO_POR_DEFECTO;

  let orden = def.porDefecto;
  const [campo, dir] = (uno(params.orden) ?? '').split(':');
  if (campo && def.ordenables.includes(campo)) {
    orden = { campo, dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : def.porDefecto.dir };
  }

  const q = (uno(params.q) ?? '').replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_BUSQUEDA);

  const filtros: Record<string, string> = {};
  for (const [id, f] of Object.entries(def.filtros)) {
    const v = uno(params[id])?.trim();
    if (!v) continue;
    if (f.tipo === 'opciones' && f.opciones.includes(v)) filtros[id] = v;
    else if (f.tipo === 'clave' && /^[A-Za-z0-9_.-]{1,50}$/.test(v)) filtros[id] = v;
    else if (f.tipo === 'entero' && /^\d{1,9}$/.test(v)) filtros[id] = v;
    else if (f.tipo === 'fecha' && esFechaValida(v)) filtros[id] = v;
  }
  for (const [id, v] of Object.entries(def.filtrosPorDefecto ?? {})) {
    if (!(id in filtros)) filtros[id] = v;
  }
  return { pagina, tamano, orden, q, filtros };
}

/** El patrón para `ILIKE … ESCAPE '\'`: lo escrito va literal, sin comodines. */
export function patronBusqueda(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Los parámetros de URL de una consulta (los que no son los de por defecto). Sirve para el enlace de exportación. */
export function paramsDeConsulta(c: ConsultaTabla, def: DefTabla): URLSearchParams {
  const p = new URLSearchParams();
  if (c.q) p.set('q', c.q);
  // Los de por defecto también van: si no, «ver todo» (que es quitar el filtro)
  // exportaría otra cosa que lo que se ve.
  for (const [id, v] of Object.entries(c.filtros)) p.set(id, v);
  if (c.orden.campo !== def.porDefecto.campo || c.orden.dir !== def.porDefecto.dir) {
    p.set('orden', `${c.orden.campo}:${c.orden.dir}`);
  }
  return p;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Lo más largo que puede ser una celda del CSV: un log con un volcado entero no debe volver el archivo ingobernable. */
export const LARGO_MAXIMO_CELDA = 2000;

/**
 * Una celda de CSV a salvo de la «inyección de fórmulas»: Excel y Sheets
 * ejecutan lo que empieza con `=`, `+`, `-`, `@`, tabulador, retorno o salto de
 * línea —y sus versiones de ancho completo—. Un nombre de empresa o un mensaje
 * de log lo escribe cualquiera, y el CSV lo abre alguien del equipo. Se le
 * antepone una comilla simple, como indica OWASP. Y se recorta a
 * `LARGO_MAXIMO_CELDA`, con «…» al final para que se note.
 */
export function celdaCsv(valor: unknown): string {
  if (valor == null) return '';
  let s = valor instanceof Date ? valor.toISOString() : String(valor);
  if (s.length > LARGO_MAXIMO_CELDA) s = `${s.slice(0, LARGO_MAXIMO_CELDA - 1)}…`;
  if (/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** El CSV completo, con BOM para que Excel respete los acentos. */
export function armarCsv(encabezados: readonly string[], filas: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n';
}
