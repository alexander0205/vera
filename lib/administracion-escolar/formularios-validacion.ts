/**
 * Cuándo se considera vacío el valor de un campo.
 *
 * Vive aparte del renderer —que es `'use client'`— para que el servidor use
 * EXACTAMENTE la misma regla al recibir el envío. Con dos copias, la pantalla
 * y la API acaban discrepando: el padre manda una ficha que la pantalla da por
 * buena y el servidor rechaza, o peor, al revés.
 */
export function isCampoVacio(tipo: string, val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'number') return false;
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    // El archivo solo cuenta cuando de verdad se subió algo.
    if (tipo === 'archivo') return !v.key;
    // Los compuestos (dirección, nombre completo) están vacíos si TODAS sus
    // partes lo están: una dirección con solo la ciudad ya es algo.
    return Object.values(v).every((x) => !x);
  }
  return false;
}
