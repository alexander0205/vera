'use client';

import { useEffect, useRef, useState } from 'react';
import type { LlamadaDTO } from './senalizacion';

const DURACION_MS = 2500;

/**
 * `true` durante los ~2.5s posteriores a que una llamada que estaba
 * `pendiente`/`activa` desaparece — así el panel/banner no se retira de
 * golpe, sino que queda un instante mostrando "Llamada finalizada" antes de
 * irse. `obtenerLlamadaVigente` (lib/webrtc/llamada-db.ts) solo devuelve
 * llamadas `pendiente`/`activa` — una vez que termina, el poll directamente
 * deja de traer el objeto (`call` pasa a `null`), nunca se ve un estado
 * `'terminada'` explícito acá. Por eso lo que hay que detectar es esa
 * transición "había algo -> ahora no hay nada", no un valor de `status`.
 */
export function useLlamadaFinalizadaReciente(call: LlamadaDTO | null): boolean {
  const [mostrar, setMostrar] = useState(false);
  const habiaLlamadaRef = useRef(false);

  useEffect(() => {
    const habiaLlamada = habiaLlamadaRef.current;
    habiaLlamadaRef.current = call != null;

    if (habiaLlamada && call == null) {
      setMostrar(true);
      const t = setTimeout(() => setMostrar(false), DURACION_MS);
      return () => clearTimeout(t);
    }
    if (call != null) setMostrar(false);
  }, [call]);

  return mostrar;
}
