'use client';

/**
 * Dueño ÚNICO de la conexión WebRTC del lado cliente ('user'), montado una
 * sola vez en el layout raíz — nunca se desmonta por más que el usuario
 * navegue entre páginas, ni siquiera al entrar a rutas donde el widget
 * flotante no se muestra (/dashboard/soporte, /zero-tickets, etc — ver
 * TicketWidgetGate).
 *
 * Antes cada consumidor (TicketWidget, SoportePaginaCompleta) llamaba su
 * PROPIO useLlamada — cada uno con su propia RTCPeerConnection. Mientras
 * compartía pantalla, cualquier navegación que desmontara al que tenía la
 * llamada activa (p.ej. entrar a /dashboard/soporte, excluido del widget)
 * mataba esa conexión en el momento del unmount. El componente que se
 * montaba después (soporte-full-page) veía `call.status === 'activa'` por
 * el poll y arrancaba un `negociar()` nuevo — pero del otro lado el agente
 * seguía con la conexión vieja, esperando nada de eso: la renegociación
 * nunca cerraba y la llamada terminaba cortándose de verdad. Con un solo
 * `useLlamada` viviendo acá arriba, no hay ningún componente cuyo unmount
 * pueda tirar la conexión — sobrevive a cualquier navegación dentro de la
 * misma pestaña.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLlamada } from './useLlamada';
import type { LlamadaDTO } from './senalizacion';

type LlamadaGlobal = ReturnType<typeof useLlamada> & { call: LlamadaDTO | null };

const LlamadaGlobalContext = createContext<LlamadaGlobal | null>(null);

export function LlamadaGlobalProvider({ children }: { children: React.ReactNode }) {
  const [call, setCall] = useState<LlamadaDTO | null>(null);
  const pollInFlightRef = useRef(false);

  // Poll liviano, solo para el estado de la llamada — la lista de mensajes
  // del ticket la sigue trayendo cada vista con su propio useTicketChat
  // (eso no necesita ser único, mostrar el chat dos veces en dos pestañas
  // del mismo usuario no rompe nada). Lo que SÍ tiene que ser único es la
  // conexión WebRTC, de ahí que viva acá y no en useTicketChat.
  useEffect(() => {
    let cancelado = false;
    async function poll() {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const res = await fetch('/api/zero-tickets/tickets');
        if (res.ok && !cancelado) {
          const data = await res.json();
          setCall(data.call ?? null);
        }
      } catch {
        // Red caída — el próximo tick reintenta solo.
      } finally {
        pollInFlightRef.current = false;
      }
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, []);

  const llamada = useLlamada('user', call);

  return (
    <LlamadaGlobalContext.Provider value={{ ...llamada, call }}>
      {children}
    </LlamadaGlobalContext.Provider>
  );
}

export function useLlamadaGlobal(): LlamadaGlobal {
  const ctx = useContext(LlamadaGlobalContext);
  if (!ctx) throw new Error('useLlamadaGlobal debe usarse dentro de LlamadaGlobalProvider');
  return ctx;
}
