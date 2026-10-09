'use client';

/**
 * ¿Hay alguien delante de esta pestaña?
 *
 * Presente = pestaña visible Y alguna actividad (ratón, teclado, toque, rueda)
 * en los últimos 10 minutos. Volver a la pestaña cuenta como actividad.
 *
 * Lo visible solo no alcanza: un equipo de la oficina que se queda encendido
 * con Zero en primer plano tiene la pestaña «visible» toda la noche, y cada
 * pregunta de sus sondeos es una consulta que no deja suspenderse a Neon. El
 * compute necesita 5 minutos seguidos sin consultas para dormirse.
 *
 * Una sola copia por pestaña: los oyentes del documento se ponen con el primer
 * suscriptor y se quitan con el último.
 */

import { useSyncExternalStore } from 'react';

export const INACTIVIDAD_MS = 10 * 60_000;

const EVENTOS_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

type Oyente = () => void;

const oyentes = new Set<Oyente>();
let ultimaActividad = 0;
let presente = true;
let temporizador: ReturnType<typeof setTimeout> | null = null;

export function pestanaVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function recalcular() {
  const ahora = pestanaVisible() && Date.now() - ultimaActividad < INACTIVIDAD_MS;
  if (ahora === presente) return;
  presente = ahora;
  oyentes.forEach((o) => o());
}

/**
 * Un solo temporizador para toda la pestaña. No se rearma con cada movimiento
 * del ratón (serían decenas por segundo): cuando vence, mira cuánto falta de
 * verdad desde la última actividad y se vuelve a poner por ese resto.
 */
function vigilarInactividad() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const resta = ultimaActividad + INACTIVIDAD_MS - Date.now();
  if (resta <= 0) {
    recalcular();
    return;
  }
  temporizador = setTimeout(vigilarInactividad, resta + 50);
}

function alActuar() {
  ultimaActividad = Date.now();
  if (presente) return;
  recalcular();
  if (presente) vigilarInactividad();
}

function alCambiarVisibilidad() {
  if (pestanaVisible()) ultimaActividad = Date.now();
  recalcular();
  if (presente) {
    vigilarInactividad();
  } else if (temporizador) {
    // Escondida ya es «ausente»: no hace falta seguir contando la inactividad.
    clearTimeout(temporizador);
    temporizador = null;
  }
}

function conectar() {
  ultimaActividad = Date.now();
  presente = pestanaVisible();
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  for (const e of EVENTOS_ACTIVIDAD) window.addEventListener(e, alActuar, { passive: true, capture: true });
  vigilarInactividad();
}

function desconectar() {
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  for (const e of EVENTOS_ACTIVIDAD) window.removeEventListener(e, alActuar, { capture: true });
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
}

/** Avisa cada vez que se pasa de presente a ausente o al revés. */
export function suscribirPresencia(oyente: Oyente): () => void {
  if (typeof document === 'undefined') return () => {};
  if (oyentes.size === 0) conectar();
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0) desconectar();
  };
}

export function estaPresente(): boolean {
  return presente;
}

/** En el servidor no hay nadie a quien preguntar: se asume que sí. */
export function usePresencia(): boolean {
  return useSyncExternalStore(suscribirPresencia, estaPresente, () => true);
}
