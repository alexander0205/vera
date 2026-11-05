/**
 * Tiempos de la Academia: segundos ↔ «m:ss», el enlace al minuto exacto de un
 * video y el texto de transcripción/capítulos que pega el administrador.
 *
 * TypeScript puro: lo usan el servidor, el cliente y las pruebas.
 */

/** Un video no pasa de 6 horas; cualquier `?t=` más grande es basura. */
export const MAX_SEGUNDOS = 6 * 3600;

/** 83 → «1:23»; 3725 → «1:02:05». */
export function formatearTiempo(seg: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seg) ? seg : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(r)}` : `${m}:${dos(r)}`;
}

/** «1:23» → 83; «1:02:05» → 3725; «83» → 83. `null` si no es un tiempo. */
export function parsearTiempo(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,5}(:\d{1,2}){0,2}$/.test(t)) return null;
  const partes = t.split(':').map(Number);
  if (partes.length > 1 && partes.slice(1).some((p) => p > 59)) return null;
  const seg = partes.reduce((acc, p) => acc * 60 + p, 0);
  return seg <= MAX_SEGUNDOS ? seg : null;
}

/** El `?t=` de la dirección → segundos válidos, o 0. */
export function segundosDeParametro(valor: string | string[] | null | undefined): number {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (!v || !/^\d{1,6}$/.test(v)) return 0;
  const n = Number(v);
  return n <= MAX_SEGUNDOS ? n : 0;
}

/** `/academia/cobrar-una-cuenta?t=83`. Sin segundos (o 0) va sin `?t=`. */
export function enlaceVideo(slug: string, seg = 0): string {
  const base = `/academia/${encodeURIComponent(slug)}`;
  const s = Math.floor(Number.isFinite(seg) ? seg : 0);
  return s > 0 && s <= MAX_SEGUNDOS ? `${base}?t=${s}` : base;
}

export interface LineaConTiempo { t: number; texto: string }

/** «10:30 am» / «3:15 p. m.»: es una hora del reloj, no una marca del video. */
const HORA_DE_RELOJ = /^\s*(?:a\.?\s?m\.?|p\.?\s?m\.?)(?=$|[\s.,;:])/i;

/**
 * Lee lo que se pega en el administrador: una línea por tramo, empezando con el
 * tiempo (`0:45 Aquí se abre la lista`, `[1:05] …`, `(1:05) …` o `1:05 - …`).
 *
 *  - Una línea sin tiempo continúa la anterior.
 *  - Un tiempo SOLO en su línea abre un tramo vacío: lo que sigue (hasta el
 *    próximo tiempo) es su texto.
 *  - «10:30 am …» no es una marca: es una hora del reloj dentro del texto.
 *  - Los tramos que quedan sin texto se descartan. Sale ordenado por tiempo.
 */
export function parsearLineasConTiempo(texto: string): LineaConTiempo[] {
  const salida: LineaConTiempo[] = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const m = /^[[(]?(\d{1,5}(?::\d{1,2}){1,2})[\])]?(.*)$/.exec(linea);
    const t = m ? parsearTiempo(m[1]) : null;
    if (m && t !== null && !HORA_DE_RELOJ.test(m[2])) {
      salida.push({ t, texto: m[2].replace(/^\s*[-–—:]?\s*/, '').trim() });
    } else if (salida.length > 0) {
      const ult = salida[salida.length - 1];
      ult.texto = ult.texto ? `${ult.texto} ${linea}` : linea;
    }
  }
  return salida.filter((l) => l.texto !== '').sort((a, b) => a.t - b.t);
}

/** El camino de vuelta: lo guardado → el texto que se edita. */
export function lineasATexto(lineas: readonly { t: number; texto?: string; titulo?: string }[]): string {
  return lineas.map((l) => `${formatearTiempo(l.t)} ${l.texto ?? l.titulo ?? ''}`.trimEnd()).join('\n');
}
