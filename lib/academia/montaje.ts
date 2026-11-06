/**
 * El orden de montaje del reproductor de Vimeo, aparte del componente para poder
 * probarlo.
 *
 * Por qué importa: el iframe de Vimeo avisa que está listo (`ready`) UNA vez, al
 * cargar. Si el iframe ya está en la página (por ejemplo, renderizado en el
 * servidor) y el `Player` se crea después —cuando llega el import dinámico—, ese
 * aviso se pierde y el reproductor nunca llega a escuchar eventos. Por eso:
 *
 *   1. se carga el paquete (import dinámico);
 *   2. SOLO entonces se mete el iframe en la página y, en el MISMO tick (sin
 *      ningún `await` entre medias), se crea el `Player`;
 *   3. se espera `ready()`;
 *   4. después se registran los eventos y se hace cualquier `setCurrentTime`.
 */

export interface JugadorMontable { ready(): Promise<unknown>; destroy(): Promise<unknown> | void }

export async function montarVimeo<P extends JugadorMontable, I>(d: {
  cargar: () => Promise<new (iframe: I) => P>;
  /** Mete el iframe en la página y lo devuelve. */
  insertarIframe: () => I;
  /** ¿El componente sigue montado? (con StrictMode o al cerrar rápido, no). */
  activo: () => boolean;
  /** Registra los eventos; solo se llama con el reproductor ya listo. */
  alListo: (p: P) => void | Promise<void>;
  /** El `Player` ya existe (para guardarlo y poder destruirlo al salir). */
  alCrear?: (p: P) => void;
}): Promise<P | null> {
  const Jugador = await d.cargar();
  if (!d.activo()) return null;
  // Mismo tick: el iframe entra al DOM y el Player lo toma sin dejar pasar nada.
  const iframe = d.insertarIframe();
  const p = new Jugador(iframe);
  d.alCrear?.(p);
  await p.ready();
  if (!d.activo()) {
    try { void p.destroy(); } catch { /* ya no está */ }
    return null;
  }
  await d.alListo(p);
  return p;
}

/** Lo que manda el evento `error` de Vimeo, dicho claro. */
export function mensajeDeErrorVimeo(e: unknown): string {
  const x = (e && typeof e === 'object' ? e : {}) as { name?: unknown; message?: unknown };
  const nombre = typeof x.name === 'string' ? x.name : '';
  if (nombre === 'PrivacyError') return 'Vimeo no deja ver este video desde Zero. Pide a quien lo subió que permita incrustarlo en este sitio.';
  if (nombre === 'NotFoundError') return 'Este video ya no está en Vimeo.';
  if (nombre === 'TypeError' || nombre === 'RangeError') return 'No se pudo mover el video a ese punto.';
  return 'El video no se pudo reproducir. Prueba de nuevo en un momento; si sigue igual, avisa a soporte.';
}
