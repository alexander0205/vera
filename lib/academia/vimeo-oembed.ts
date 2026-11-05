/**
 * La miniatura y la duración de un video de Vimeo, leídas del oEmbed público
 * (sin llave) al guardar. Si Vimeo no contesta, el administrador las escribe a
 * mano: nada de esto es obligatorio para guardar.
 *
 * El lector va detrás de una función que se pasa por parámetro, para que las
 * pruebas NO llamen a Vimeo.
 */
import { interpretarOembed, urlOembedVimeo, type VideoVimeo } from './vimeo';

export type LectorOembed = (v: VideoVimeo) => Promise<{ miniaturaUrl: string | null; duracionSeg: number } | null>;

const TIEMPO_MS = 5_000;

/** El lector de verdad: una petición con tope de 5 s. Nunca lanza. */
export const leerOembedVimeo: LectorOembed = async (v) => {
  try {
    const r = await fetch(urlOembedVimeo(v), { signal: AbortSignal.timeout(TIEMPO_MS), headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return interpretarOembed(await r.json());
  } catch {
    return null;
  }
};

/**
 * Llena lo que falta (miniatura y duración) con el oEmbed. Lo que el
 * administrador ya escribió NO se pisa, y si no falta nada ni se pregunta.
 */
export async function completarDesdeOembed<E extends { miniaturaUrl: string | null; duracionSeg: number }>(
  entrada: E, video: VideoVimeo, lector: LectorOembed = leerOembedVimeo,
): Promise<E> {
  if (entrada.miniaturaUrl && entrada.duracionSeg > 0) return entrada;
  let r: Awaited<ReturnType<LectorOembed>> = null;
  try { r = await lector(video); } catch { r = null; }
  if (!r) return entrada;
  return {
    ...entrada,
    miniaturaUrl: entrada.miniaturaUrl ?? r.miniaturaUrl,
    duracionSeg: entrada.duracionSeg > 0 ? entrada.duracionSeg : r.duracionSeg,
  };
}
