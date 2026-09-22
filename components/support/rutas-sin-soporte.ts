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
  /*
    `/caja/imprimir/` es la tercera página de impresión (app/(print)) y se
    había quedado fuera: una hoja de cuadre abierta sondeaba las llamadas cada
    3 s mientras nadie cerrara la pestaña. El 2026-09-17 la del turno 258 hizo
    752 peticiones ella sola.
  */
  '/pos-reporte', '/pos-ticket', '/caja/imprimir/', '/zero-tickets', '/dashboard/soporte',
  /*
    Públicas, sin sesión: enlace de pago del padre, pago por link, documento
    compartido, formulario público y subida de foto.

    Todas llevan barra final porque las cinco son `[token]` o `[slug]`: no
    existe la ruta a secas. Sin la barra, `/foto` se comía `/fotos-galeria` y
    `/d` se habría comido `/dashboard` entero — el colegio se quedaba sin
    soporte en su pantalla principal por un prefijo de dos letras.
  */
  '/pagar/', '/pay/', '/d/', '/f/', '/foto/',
  // Nómina: el empleado firma su contrato y sube sus horas sin cuenta en Zero.
  '/firmar/', '/horas/',
  // Quien fotografía una factura de proveedor con el enlace de la empresa.
  '/subir-factura/',
];

/** ¿En esta ruta hay soporte? `null`/`undefined` (aún sin resolver) cuenta como que sí. */
export function soporteAplica(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !RUTAS_SIN_SOPORTE.some((p) => pathname.startsWith(p));
}

/**
 * ¿Se vigilan aquí las llamadas de soporte? Lo mismo que `soporteAplica`, más
 * `/dashboard/soporte`.
 *
 * Esa ruta está en la lista porque en ella no van ni el panel flotante ni el
 * botón —la página ES el chat—, no porque no haya soporte. Al unificar la
 * lista, el sondeo de llamadas la heredó entera y dejó de correr justo en la
 * página de soporte: `call` quedaba en `null` ahí, así que la invitación de una
 * llamada no aparecía nunca y el panel de una llamada en curso desaparecía al
 * entrar.
 */
export function vigilaLlamadas(pathname: string | null | undefined): boolean {
  return soporteAplica(pathname) || Boolean(pathname?.startsWith('/dashboard/soporte'));
}
