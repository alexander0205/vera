'use client';

/**
 * Dueño ÚNICO de la conexión WebRTC del lado cliente ('user'), montado una
 * sola vez en el layout raíz — nunca se desmonta por más que el usuario
 * navegue entre páginas, ni siquiera al entrar a rutas donde el widget
 * flotante no se muestra (/dashboard/soporte, etc — ver TicketWidgetGate).
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
 *
 * EXCLUIDO de /zero-tickets a propósito — confirmado con logs reales: la
 * consola de agente YA tiene su propio useLlamada('agent', call) en
 * app/zero-tickets/page.tsx. Si la cuenta logueada es, además, dueña de
 * algún ticket propio (nada raro para quien prueba localmente, o para un
 * agente que también es cliente de otro equipo), este provider — al estar
 * montado en el layout raíz, sin importar la ruta — se ponía a negociar
 * la MISMA llamada como 'user' en la MISMA pestaña donde la consola ya la
 * estaba negociando como 'agent'. Dos RTCPeerConnection, dos
 * getUserMedia, dos roles de señalización compitiendo desde el mismo
 * lado: de ahí el micrófono que quedaba pegado, el 409 al mandar señales,
 * y la llamada cortándose sola después de compartir pantalla.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLlamada } from './useLlamada';
import type { LlamadaDTO } from './senalizacion';

type LlamadaGlobal = ReturnType<typeof useLlamada> & { call: LlamadaDTO | null };

const LlamadaGlobalContext = createContext<LlamadaGlobal | null>(null);

export function LlamadaGlobalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // La consola de agente ya tiene su propio useLlamada('agent', call) — ver
  // el comentario grande arriba del archivo para el porqué de esta exclusión.
  const enConsolaAgente = pathname?.startsWith('/zero-tickets') ?? false;

  const [call, setCall] = useState<LlamadaDTO | null>(null);
  const pollInFlightRef = useRef(false);

  // Poll liviano, solo para el estado de la llamada — la lista de mensajes
  // del ticket la sigue trayendo cada vista con su propio useTicketChat
  // (eso no necesita ser único, mostrar el chat dos veces en dos pestañas
  // del mismo usuario no rompe nada). Lo que SÍ tiene que ser único es la
  // conexión WebRTC, de ahí que viva acá y no en useTicketChat.
  useEffect(() => {
    if (enConsolaAgente) {
      setCall(null);
      return;
    }
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
  }, [enConsolaAgente]);

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
