/**
 * Claves de SWR que más de una pantalla del módulo escolar tiene que refrescar
 * a la vez. Pura, sin red: se pasa tal cual como filtro a `mutate` global.
 */

/** Las consultas de «Cuentas por cobrar» (con cualquier filtro en la URL). */
export function esClaveCuentasPorCobrar(key: unknown): boolean {
  return typeof key === 'string' && /^\/api\/cuentas-por-cobrar(\?|$)/.test(key);
}
