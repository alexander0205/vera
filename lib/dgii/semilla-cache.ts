/**
 * Semillas de autenticación emitidas por `/fe/autenticacion/api/semilla`, que
 * `/fe/autenticacion/api/validacioncertificado` consume.
 *
 * Vivía exportada desde el archivo de la ruta de la semilla, y Next no admite
 * en un `route.ts` más exportaciones que los métodos y su configuración: la
 * build fallaba con «getSemillaCache is not assignable to type never». Aquí
 * sigue siendo un solo Map por proceso, igual que antes.
 *
 * Cache en memoria: token → { valor, expira }.
 * En producción multiinstancia usar Redis/Upstash.
 */
const semillaCache = new Map<string, { valor: string; expira: number }>();

export function getSemillaCache() {
  return semillaCache;
}
