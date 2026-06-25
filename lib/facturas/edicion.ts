/**
 * Hotfix — Edición de facturas DESHABILITADA para todos los roles.
 *
 * Decisión de producto (hotfix): ni admin ni ningún rol puede editar facturas
 * de ningún tipo, incluidos los BORRADORES. La UI oculta toda opción de editar
 * y el guard de la ruta /editar bloquea el acceso directo por URL.
 *
 * Punto ÚNICO de control para revertir. Para volver a "solo bloquear emitidas"
 * (permitiendo editar borradores e históricas), cambiar el cuerpo a:
 *
 *   return ['BORRADOR', 'HISTORICA'].includes(estado);
 *
 * No dispersar esta lógica: todos los gates de edición deben llamar aquí.
 */
export function edicionPermitida(_estado: string): boolean {
  return false;
}
