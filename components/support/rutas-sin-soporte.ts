/**
 * Rutas donde el soporte no existe.
 *
 * Vive en su propio archivo, sin React, porque lo necesitan tres piezas que no
 * se importan entre sí: el panel del chat, el botón de la barra superior y el
 * sondeo de llamadas del `LlamadaGlobalProvider`. Cuando la lista vivía dentro
 * del contexto de soporte, el provider de llamadas tenía la SUYA —solo
 * `/zero-tickets`— y se desincronizaron sin que se notara.
 *
 * Lo que se veía: la página pública del enlace de pago escondía el chat pero
 * seguía pidiendo `/api/zero-tickets/tickets` cada 3 segundos y cobrando un 401
 * cada vez, para siempre, en la pestaña de un padre que ni siquiera tiene
 * cuenta.
 */

/**
 * Prefijos de ruta sin soporte:
 *
 *   - Impresión: van a papel, no a alguien mirando la pantalla.
 *   - Consola de agentes: son el equipo de soporte, no un cliente.
 *   - Públicas: quien las abre no tiene sesión ni cuenta. Ofrecerle un chat de
 *     soporte del colegio es prometerle algo que no puede usar — el soporte es
 *     para el colegio, no para su clientela.
 */
export const RUTAS_SIN_SOPORTE = [
  '/pos-reporte', '/pos-ticket', '/zero-tickets', '/dashboard/soporte',
  /*
    Públicas, sin sesión: enlace de pago del padre, pago por link, documento
    compartido, formulario público y subida de foto.

    Todas llevan barra final porque las cinco son `[token]` o `[slug]`: no
    existe la ruta a secas. Sin la barra, `/foto` se comía `/fotos-galeria` y
    `/d` se habría comido `/dashboard` entero — el colegio se quedaba sin
    soporte en su pantalla principal por un prefijo de dos letras.
  */
  '/pagar/', '/pay/', '/d/', '/f/', '/foto/',
];

/** ¿En esta ruta hay soporte? `null`/`undefined` (aún sin resolver) cuenta como que sí. */
export function soporteAplica(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !RUTAS_SIN_SOPORTE.some((p) => pathname.startsWith(p));
}
