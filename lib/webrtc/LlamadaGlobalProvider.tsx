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

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { vigilaLlamadas } from '@/components/support/rutas-sin-soporte';
import { crearSondeo, type Sondeo } from '@/lib/sondeo/sondeo';
import { intervaloLlamadas } from '@/lib/sondeo/intervalos';
import { estaPresente, suscribirPresencia } from '@/lib/sondeo/presencia';
import { useLlamada } from './useLlamada';
import type { LlamadaDTO } from './senalizacion';

type LlamadaGlobal = ReturnType<typeof useLlamada> & {
  call: LlamadaDTO | null;
  /** Pregunta ya, sin esperar al próximo turno (p. ej. recién aceptada la llamada). */
  refrescar: () => void;
};

const LlamadaGlobalContext = createContext<LlamadaGlobal | null>(null);

export function LlamadaGlobalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /**
   * Dónde NO se sondea.
   *
   * Antes esto solo esquivaba la consola de agente —que ya tiene su propio
   * `useLlamada('agent', call)`, ver el comentario grande arriba— y se le
   * escapaban las páginas públicas: el enlace de pago de un padre pedía
   * `/api/zero-tickets/tickets` cada 3 segundos y cobraba un 401 cada vez,
   * mientras la pestaña siguiera abierta.
   *
   * Se usa la MISMA lista que el chat y el botón de la barra, salvo
   * `/dashboard/soporte`: ver `vigilaLlamadas`.
   */
  const sinSondeo = !vigilaLlamadas(pathname);

  const [call, setCall] = useState<LlamadaDTO | null>(null);
  const sondeoRef = useRef<Sondeo | null>(null);
  /**
   * El servidor contestó 4xx: sin sesión (la pantalla de entrar, una sesión
   * vencida con la página aún abierta) o sin empresa. Se deja de preguntar
   * hasta que algo pueda haberlo cambiado: una navegación (entrar redirige) o
   * volver a la pestaña. Antes se cobraba un 401 cada 3 s mientras la pestaña
   * siguiera abierta: el 2026-09-17 fueron 2,468, 1,083 de ellos desde la
   * página pública de precios (www.zero.com.do/precios) y 698 de una sola
   * pestaña con la sesión vencida.
   */
  const sinSesionRef = useRef(false);

  // Sondeo liviano, solo para el estado de la llamada — la lista de mensajes
  // del ticket la sigue trayendo cada vista con su propio useTicketChat
  // (eso no necesita ser único, mostrar el chat dos veces en dos pestañas
  // del mismo usuario no rompe nada). Lo que SÍ tiene que ser único es la
  // conexión WebRTC, de ahí que viva acá y no en useTicketChat.
  //
  // El ritmo lo decide `intervaloLlamadas` con lo que acaba de leer y con si
  // hay alguien delante: de 3 s fijos en cada pestaña abierta a 15 s con
  // alguien mirando, y nada con la pestaña escondida salvo que haya una
  // conversación o una llamada en marcha.
  useEffect(() => {
    if (sinSondeo) {
      setCall(null);
      return;
    }
    let conversacionViva = false;
    let llamadaEnCurso = false;
    sinSesionRef.current = false;

    const sondeo = crearSondeo({
      async consultar(senal) {
        const res = await fetch('/api/zero-tickets/tickets/llamada', { signal: senal });
        if (senal.aborted) return;
        if (!res.ok) {
          // 5xx: tropiezo pasajero, se reintenta al ritmo de siempre.
          if (res.status < 500) {
            sinSesionRef.current = true;
            llamadaEnCurso = false;
            setCall(null);
          }
          return;
        }
        const data = (await res.json()) as { call: LlamadaDTO | null; conversacionViva: boolean };
        if (senal.aborted) return;
        sinSesionRef.current = false;
        conversacionViva = Boolean(data.conversacionViva);
        llamadaEnCurso = Boolean(data.call);
        setCall(data.call ?? null);
      },
      intervalo: () => intervaloLlamadas({
        presente: estaPresente(),
        conversacionViva,
        llamadaEnCurso,
        sinSesion: sinSesionRef.current,
      }),
    });
    sondeoRef.current = sondeo;
    sondeo.refrescar();

    // Al volver alguien se pregunta en el acto: una invitación dura 60 s y no
    // hay que esperar al próximo turno para verla. Al irse, se recalcula (y
    // casi siempre se pausa).
    const quitar = suscribirPresencia(() => {
      if (estaPresente()) {
        sinSesionRef.current = false;
        sondeo.refrescar();
      } else {
        sondeo.reprogramar();
      }
    });

    return () => {
      quitar();
      sondeo.detener();
      sondeoRef.current = null;
    };
  }, [sinSondeo]);

  // Tras un 401 el sondeo queda quieto; entrar navega, y ahí se vuelve a
  // preguntar. Con sesión no hace nada: navegar no cambia si te llaman.
  useEffect(() => {
    if (!sinSesionRef.current) return;
    sinSesionRef.current = false;
    sondeoRef.current?.refrescar();
  }, [pathname]);

  const refrescar = useCallback(() => sondeoRef.current?.refrescar(), []);

  const llamada = useLlamada('user', call);

  return (
    <LlamadaGlobalContext.Provider value={{ ...llamada, call, refrescar }}>
      {children}
    </LlamadaGlobalContext.Provider>
  );
}

export function useLlamadaGlobal(): LlamadaGlobal {
  const ctx = useContext(LlamadaGlobalContext);
  if (!ctx) throw new Error('useLlamadaGlobal debe usarse dentro de LlamadaGlobalProvider');
  return ctx;
}
