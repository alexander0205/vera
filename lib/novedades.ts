/**
 * Las novedades que se le enseñan a cada persona al entrar, una sola vez.
 *
 * El sistema ya tenía la pantalla «Novedades» y el archivo donde se escriben
 * los cambios en el idioma del cliente (`content/novedades.json`), pero nadie
 * se enteraba: había que ir a buscarla desde un enlace al final del menú. Se
 * pidió que, cada vez que se suban cambios, a quien entre le salga una ventana
 * grande con lo nuevo, que la cierre, y que no vuelva a salir hasta la
 * siguiente tanda.
 *
 * Cómo se decide qué es «lo nuevo»:
 *  - Sale lo que esté en `pendiente` y en la última versión publicada, y solo
 *    las entradas que llevan fecha (`desde`). Las dos listas, porque publicar
 *    una versión mueve `pendiente` a `versiones[0]` y ese paso no debe hacer
 *    que la ventana vuelva a salir con lo mismo.
 *  - Cada entrada tiene una clave corta que sale de su tipo y su título, no de
 *    su posición ni de la versión: por lo mismo.
 *  - Lo que la persona ya cerró se recuerda por sus claves. Una entrada nueva
 *    sale sola, sin repetir las anteriores.
 *  - Lo viejo no se le enseña a quien llega después: pasada la ventana de
 *    días, una entrada deja de salir aunque nadie la haya cerrado.
 *
 * Dónde se recuerda: en una cookie por usuario, puesta en el dominio raíz. No
 * en `localStorage`, porque cada módulo vive en su subdominio y la ventana
 * saldría una vez en cada uno.
 *
 * TypeScript puro, sin React ni base de datos: lo usan el layout, la ventana y
 * la ruta que marca lo visto, y lo prueba vitest sin montar nada.
 */

export type TipoCambio = 'nuevo' | 'mejora' | 'arreglo';

export interface Cambio {
  tipo: TipoCambio;
  titulo: string;
  detalle: string;
  /** El día en que se escribió (`AAAA-MM-DD`). Sin él, no sale en la ventana. */
  desde?: string;
}

export interface DocNovedades {
  pendiente?: { titulo?: string; cambios?: Cambio[] };
  versiones?: { version: string; fecha: string; titulo: string; cambios: Cambio[] }[];
}

/** Una entrada lista para enseñar: con su clave y su fecha. */
export interface Novedad {
  clave: string;
  tipo: TipoCambio;
  titulo: string;
  detalle: string;
  desde: string;
}

/** Cuántos días se sigue enseñando una novedad a quien no la ha cerrado. */
export const DIAS_DE_NOVEDAD = 45;

/** Cuántas claves vistas se recuerdan. Sobra para años de novedades fechadas. */
const MAX_VISTAS = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLAVE = /^[a-z0-9]{1,8}$/;

/**
 * La clave de una entrada: corta, y la misma mientras no cambien su tipo ni su
 * título. FNV-1a de 32 bits en base 36; no es criptografía, es un nombre.
 */
export function claveDeCambio(c: Pick<Cambio, 'tipo' | 'titulo'>): string {
  const texto = `${c.tipo}|${c.titulo.trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Las entradas fechadas de `pendiente` y de la última versión, de la más nueva a la más vieja. */
export function novedadesFechadas(doc: DocNovedades): Novedad[] {
  const candidatas = [...(doc.pendiente?.cambios ?? []), ...(doc.versiones?.[0]?.cambios ?? [])];
  const vistas = new Set<string>();
  const salida: Novedad[] = [];
  for (const c of candidatas) {
    if (!c.desde || !FECHA.test(c.desde)) continue;
    const clave = claveDeCambio(c);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({ clave, tipo: c.tipo, titulo: c.titulo, detalle: c.detalle, desde: c.desde });
  }
  // `sort` es estable: con la misma fecha se respeta el orden del archivo.
  return salida.sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0));
}

/** `AAAA-MM-DD` de N días antes de `hoy`. */
function diasAntes(hoy: string, dias: number): string {
  const [a, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/**
 * Lo que hay que enseñarle a esta persona hoy: lo fechado que todavía es
 * reciente y que no ha cerrado. Vacío = no se abre nada.
 */
export function novedadesSinVer(fechadas: readonly Novedad[], vistas: readonly string[], hoy: string): Novedad[] {
  const limite = diasAntes(hoy, DIAS_DE_NOVEDAD);
  const ya = new Set(vistas);
  // Una fecha futura (el reloj de quien la escribió iba adelantado) también vale.
  return fechadas.filter((n) => n.desde >= limite && !ya.has(n.clave));
}

/** El nombre de la cookie de un usuario. Una por usuario: dos personas en el mismo navegador no se pisan. */
export function cookieDeNovedades(userId: number): string {
  return `zero_nov_${userId}`;
}

/** Las claves que guarda el valor de la cookie. Lo que no parezca una clave se descarta. */
export function clavesDeLaCookie(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return [...new Set(valor.split('.').filter((c) => CLAVE.test(c)))];
}

/** Las claves vistas de este usuario, leídas de `document.cookie` (o de la cabecera Cookie). */
export function vistasEnCookies(cookies: string, userId: number): string[] {
  const nombre = `${cookieDeNovedades(userId)}=`;
  for (const trozo of cookies.split(';')) {
    const t = trozo.trim();
    if (t.startsWith(nombre)) return clavesDeLaCookie(decodeURIComponent(t.slice(nombre.length)));
  }
  return [];
}

/**
 * El valor nuevo de la cookie al cerrar la ventana: lo que ya había más lo que
 * se acaba de enseñar. Se quedan las últimas `MAX_VISTAS`.
 */
export function valorAlCerrar(vistas: readonly string[], mostradas: readonly string[]): string {
  const todas = [...new Set([...vistas, ...mostradas].filter((c) => CLAVE.test(c)))];
  return todas.slice(-MAX_VISTAS).join('.');
}
