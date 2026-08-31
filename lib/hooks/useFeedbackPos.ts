'use client';

/**
 * Preferencias de sonido/vibración del POS, ya conectadas a la caja.
 *
 * Vive aparte del componente porque hay dos sitios que las tocan —la caja y el
 * menú de ajustes— y porque el desbloqueo del audio tiene una regla que no se
 * puede olvidar: se hace en el PRIMER gesto real del usuario. Ver la nota en
 * lib/pos/feedback.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitir, leerPrefs, guardarPrefs, despertarAudio, puedeVibrar,
  pasoVolumen, nivelVolumen, PASOS_VOLUMEN,
  PREFS_POR_DEFECTO, type PrefsFeedback, type Senal,
} from '@/lib/pos/feedback';

export function useFeedbackPos() {
  // Arranca con los valores de fábrica y lee el almacenamiento ya montado: en el
  // servidor no hay localStorage, y leerlo durante el render daría un HTML
  // distinto del que calcula el cliente.
  const [prefs, setPrefs] = useState<PrefsFeedback>(PREFS_POR_DEFECTO);
  const [conVibracion, setConVibracion] = useState(false);
  const prefsRef = useRef(prefs);

  useEffect(() => {
    const p = leerPrefs();
    setPrefs(p);
    prefsRef.current = p;
    setConVibracion(puedeVibrar());
  }, []);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  /**
   * Despierta el audio al primer toque o tecla de la pantalla.
   *
   * Se engancha en captura y con `once`: cualquier gesto vale —tocar un
   * producto, escribir en el buscador, pasar el lector de códigos— y se quita
   * solo. Sin esto, el primer producto de cada turno saldría mudo y parecería
   * que el sonido está roto.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const abrir = () => despertarAudio();
    const opciones = { once: true, capture: true } as const;
    window.addEventListener('pointerdown', abrir, opciones);
    window.addEventListener('keydown', abrir, opciones);
    return () => {
      window.removeEventListener('pointerdown', abrir, opciones);
      window.removeEventListener('keydown', abrir, opciones);
    };
  }, []);

  /**
   * Emite una señal. Estable entre renders y lee las preferencias de una ref, no
   * del estado: si dependiera del estado, cambiar el interruptor recrearía la
   * función y con ella todos los manejadores de la grilla.
   */
  const senal = useCallback((s: Senal) => emitir(s, prefsRef.current), []);

  const cambiar = useCallback((parcial: Partial<PrefsFeedback>) => {
    setPrefs((prev) => {
      const siguiente = { ...prev, ...parcial };
      guardarPrefs(siguiente);
      prefsRef.current = siguiente;
      // Muestra al vuelo: al encender algo o al mover el volumen se oye el
      // resultado en ese momento. Ajustar un volumen a ciegas y descubrir cómo
      // quedó en la siguiente venta no es ajustar nada.
      const tocoAlgoAudible = parcial.sonido === true
        || parcial.vibracion === true
        || (parcial.volumen != null && parcial.volumen > 0);
      if (tocoAlgoAudible) emitir('agregar', siguiente);
      return siguiente;
    });
  }, []);

  /** Sube o baja un peldaño el volumen. Encender el sonido si estaba apagado. */
  const subirVolumen = useCallback((direccion: 1 | -1) => {
    setPrefs((prev) => {
      const volumen = pasoVolumen(prev.volumen, direccion);
      // Subir desde el silencio también vuelve a encender el sonido: pedir dos
      // gestos para lo que el usuario ya pidió una vez es de mal gusto.
      const sonido = volumen > 0 ? true : prev.sonido;
      const siguiente = { ...prev, volumen, sonido };
      guardarPrefs(siguiente);
      prefsRef.current = siguiente;
      if (volumen > 0 && sonido) emitir('agregar', siguiente);
      return siguiente;
    });
  }, []);

  return {
    prefs,
    cambiar,
    subirVolumen,
    senal,
    conVibracion,
    nivel: nivelVolumen(prefs.volumen),
    nivelMaximo: PASOS_VOLUMEN.length - 1,
  };
}
