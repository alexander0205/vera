/**
 * Cuándo un video cuenta como «visto» y cuándo se guarda el avance.
 *
 * Un salto con `?t=` (o un clic en un capítulo) cerca del final NO es haber
 * visto el video: se exige haber REPRODUCIDO de verdad una parte. La
 * reproducción se mide sumando los avances normales del reloj (pasos chicos
 * entre dos `timeupdate`); un salto no suma.
 */

export interface Reproduccion {
  /** Posición del último `timeupdate` visto, o null si aún no hubo. */
  ultimo: number | null;
  /** Segundos realmente reproducidos, sin contar saltos. */
  total: number;
}

export const REPRODUCCION_NUEVA: Reproduccion = { ultimo: null, total: 0 };

/** Un paso mayor que esto es un salto, no reproducción. `timeupdate` llega unas 4 veces por segundo. */
const MAX_PASO_SEG = 2;

export function acumularReproduccion(r: Reproduccion, posicion: number): Reproduccion {
  if (!Number.isFinite(posicion)) return r;
  if (r.ultimo === null) return { ultimo: posicion, total: r.total };
  const paso = posicion - r.ultimo;
  return { ultimo: posicion, total: paso > 0 && paso <= MAX_PASO_SEG ? r.total + paso : r.total };
}

/** Lo mínimo que hay que haber reproducido: el 20 % del video, entre 3 y 30 segundos. */
export function minimoReproducido(duracion: number): number {
  const d = duracion > 0 ? duracion : 0;
  return Math.min(30, Math.max(3, d * 0.2));
}

export function esVisto(d: { posicion: number; duracion: number; reproducidoSeg: number; terminado: boolean }): boolean {
  if (d.reproducidoSeg < minimoReproducido(d.duracion)) return false;
  if (d.terminado) return true;
  return d.duracion > 0 && d.posicion / d.duracion >= 0.9;
}

/** ¿Se guarda el avance? Solo si de verdad se reprodujo algo: llegar por un enlace y salir no pisa el avance. */
export function debeGuardarAvance(reproducidoSeg: number): boolean {
  return reproducidoSeg >= 3;
}

/** Videos empezados y sin terminar (con avance), los de más avance primero. */
export function enCurso<V extends { visto: boolean; avanceSeg: number; duracionSeg: number }>(videos: readonly V[]): V[] {
  return videos
    .filter((v) => !v.visto && v.avanceSeg >= 3 && (v.duracionSeg === 0 || v.avanceSeg < v.duracionSeg - 2))
    .sort((a, b) => b.avanceSeg - a.avanceSeg);
}
