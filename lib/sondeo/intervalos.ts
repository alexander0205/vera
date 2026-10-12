/**
 * Cada cuánto se pregunta al servidor, según quién está mirando.
 *
 * Funciones puras a propósito: son la política entera de los sondeos del
 * soporte y se prueban solas (tests/unit/sondeo-intervalos.test.ts). Si hay
 * que afinar un ritmo, se toca aquí y en ningún otro sitio.
 */

/**
 * Sin mensajes en este tiempo, una conversación se da por dormida. Es el mismo
 * umbral con el que el cron de auto-cierre la cierra
 * (app/api/cron/zero-tickets-auto-close): pasado ese punto nadie está
 * esperando una respuesta ni una llamada en ella. Se mira la hora del último
 * mensaje y no solo el estado porque ese cron no corre de noche: un ticket
 * puede seguir «abierto» hasta las 07:00 sin que nadie lo esté usando.
 */
export const CONVERSACION_VIVA_MS = 30 * 60_000;

export interface EstadoLlamadas {
  /** La pestaña está a la vista y alguien la usó hace poco (ver presencia.ts). */
  presente: boolean;
  /** Ticket sin cerrar con mensajes en los últimos 30 min. */
  conversacionViva: boolean;
  /** Hay una llamada pendiente o activa. */
  llamadaEnCurso: boolean;
  /** El servidor contestó 4xx (sin sesión, sin empresa): preguntar no cambia nada. */
  sinSesion: boolean;
}

/**
 * ¿Me está llamando soporte?
 *
 * Una invitación caduca a los 60 s (lib/webrtc/llamada-db.ts), así que todos los
 * ritmos con alguien delante quedan muy por debajo de eso.
 *
 *   - Llamada en curso: 3 s pase lo que pase, como antes. Aceptar, colgar o que
 *     el agente corte tienen que verse enseguida, y en plena llamada la pestaña
 *     puede estar escondida (compartiendo otra ventana).
 *   - Conversación viva: 5 s con alguien delante. Es donde el agente llama de
 *     verdad («¿te llamo y lo vemos?»). Sin nadie delante se sigue, más lento,
 *     para que suene el tono aunque la persona haya cambiado de pestaña a esperar.
 *   - Sin conversación: 15 s con alguien delante. El agente PUEDE llamar sobre
 *     un ticket cerrado, pero es raro. Sin nadie delante, nada: al volver se
 *     pregunta en el acto.
 */
export function intervaloLlamadas(e: EstadoLlamadas): number | null {
  if (e.sinSesion) return null;
  if (e.llamadaEnCurso) return 3_000;
  if (e.conversacionViva) return e.presente ? 5_000 : 20_000;
  return e.presente ? 15_000 : null;
}

export interface EstadoChat {
  /** El panel de soporte o la página /dashboard/soporte está a la vista. */
  abierto: boolean;
  /** La pestaña está a la vista (aunque nadie toque nada). */
  visible: boolean;
  /** Visible y usada hace poco. */
  presente: boolean;
  conversacionViva: boolean;
  /** Desde el último mensaje, cambio de estado o tecla propia. */
  msDesdeUltimoCambio: number;
}

/**
 * Los mensajes del chat abierto.
 *
 * Cerrado, no se pregunta: nadie lo está leyendo, y la llamada ya la vigila el
 * LlamadaGlobalProvider. Abierto, 1.5 s mientras hay movimiento y se va
 * frenando si no pasa nada: quien deja el panel abierto toda la tarde no tiene
 * por qué traerse la conversación entera cada segundo y medio.
 *
 * Con la pestaña visible pero nadie delante se sigue solo si la conversación
 * está viva: puede estar mirando la pantalla, esperando la respuesta.
 */
export function intervaloChat(e: EstadoChat): number | null {
  if (!e.abierto || !e.visible) return null;
  if (!e.presente && !e.conversacionViva) return null;
  if (e.msDesdeUltimoCambio < 30_000) return 1_500;
  if (e.msDesdeUltimoCambio < 2 * 60_000) return 3_000;
  return 6_000;
}

/** Ticket sin cerrar y con mensajes recientes. `ultimoMensajeMs` en epoch ms. */
export function esConversacionViva(
  estado: string | null | undefined,
  ultimoMensajeMs: number | null | undefined,
  ahoraMs: number,
): boolean {
  if (!estado || estado === 'cerrado' || ultimoMensajeMs == null) return false;
  return ahoraMs - ultimoMensajeMs < CONVERSACION_VIVA_MS;
}
