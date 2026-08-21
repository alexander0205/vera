'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConexionLlamada, TIMEOUT_CONEXION_MS } from './conexion';
import { mandarSenal, leerSenales, terminarLlamada, obtenerIceServers, type LlamadaDTO } from './senalizacion';

export type EstadoLlamada = 'inactiva' | 'conectando' | 'activa' | 'error';

const TIMEOUT_DESCONEXION_MS = 10000;

/**
 * Orquesta la conexión WebRTC de una llamada. El ESTADO de la llamada
 * (pendiente/activa/terminada) lo trae el poll que cada lado ya tiene
 * (useTicketChat para el cliente, el poll de mensajes para el agente) — este
 * hook solo reacciona a esos cambios y maneja la conexión de media en sí.
 */
export function useLlamada(role: 'user' | 'agent', call: LlamadaDTO | null) {
  const [estado, setEstado] = useState<EstadoLlamada>('inactiva');
  const [error, setError] = useState<string | null>(null);
  const [micActivo, setMicActivo] = useState(true);
  const [compartiendoPantalla, setCompartiendoPantalla] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const estadoRef = useRef<EstadoLlamada>('inactiva');
  const conexionRef = useRef<ConexionLlamada | null>(null);
  const callIdEnCursoRef = useRef<number | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutConexionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 10s de gracia cuando la conexión pasa a 'disconnected' — un lag de red
  // breve no debe cortar la llamada de una, pero si no se recupera en ese
  // plazo sí hay que cerrarla (tabla de errores del spec de diseño).
  const desconexionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaSenalRef = useRef(0);
  // Contador de generación: identifica la INVOCACIÓN de negociar(), no la
  // llamada (`call.id`) que negocia — dos invocaciones distintas (p.ej. una
  // previa a un remount de Strict Mode y la que arranca después) negocian
  // el mismo call.id, así que comparar contra call.id no alcanza para
  // distinguir "sigo siendo la vigente" de "negocio la misma llamada que
  // otra invocación". Solo la invocación cuyo miGen matchea el contador
  // vigente tiene permiso de tocar conexionRef/timeoutConexionRef/signalPollRef.
  const negociarGenRef = useRef(0);

  function fijarEstado(nuevo: EstadoLlamada) {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }

  const limpiar = useCallback((mensajeError?: string) => {
    // Invalida cualquier negociar() en vuelo (p.ej. suspendido en un await)
    // aunque no haya una invocación nueva reemplazándola todavía — si no,
    // un unmount sin remount posterior nunca haría que esa invocación se
    // detecte a sí misma como obsoleta.
    negociarGenRef.current += 1;
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    if (timeoutConexionRef.current) clearTimeout(timeoutConexionRef.current);
    if (desconexionRef.current) clearTimeout(desconexionRef.current);
    signalPollRef.current = null;
    timeoutConexionRef.current = null;
    desconexionRef.current = null;
    conexionRef.current?.cerrar();
    conexionRef.current = null;
    callIdEnCursoRef.current = null;
    ultimaSenalRef.current = 0;
    setRemoteStream(null);
    setCompartiendoPantalla(false);
    fijarEstado(mensajeError ? 'error' : 'inactiva');
    setError(mensajeError ?? null);
  }, []);

  const colgar = useCallback((reason: string = 'colgada') => {
    const id = callIdEnCursoRef.current;
    if (id) terminarLlamada(id, reason);
    limpiar();
  }, [limpiar]);

  const negociar = useCallback(async (llamada: LlamadaDTO, soyOfertante: boolean) => {
    callIdEnCursoRef.current = llamada.id;
    // Generación de ESTA invocación de negociar() — no del call.id (dos
    // invocaciones distintas pueden negociar el mismo call.id, p.ej. una
    // antes de un remount de Strict Mode y la que arranca después de él).
    // Comparar contra el contador global después de cada `await` es lo que
    // distingue "sigo siendo la invocación vigente" de "estoy negociando la
    // misma llamada que otra invocación también está negociando".
    const miGen = ++negociarGenRef.current;
    // Referencia local a la conexión que ESTA instancia de negociar crea —
    // si queda obsoleta, hay que cerrarla explícitamente aunque para ese
    // momento conexionRef.current ya apunte a otra cosa (la de una
    // invocación posterior) o a null (la limpió un unmount).
    let conexionLocal: ConexionLlamada | null = null;
    // Guard simétrico para todo punto de salida por staleness que ocurra
    // DESPUÉS de tener conexionLocal asignada — cada uno se hace cargo de
    // cerrar su propia conexión en vez de confiar en que quien invalidó la
    // generación (hoy siempre limpiar()) ya la cerró por su cuenta.
    const cerrarSiHuerfana = () => {
      if (conexionLocal && conexionRef.current !== conexionLocal) conexionLocal.cerrar();
    };
    fijarEstado('conectando');
    setError(null);
    try {
      const iceServers = await obtenerIceServers();
      if (negociarGenRef.current !== miGen) return; // cancelada mientras esperábamos ICE servers

      const conexion = new ConexionLlamada(iceServers);
      conexionLocal = conexion;
      if (negociarGenRef.current !== miGen) {
        conexion.cerrar();
        return;
      }
      conexionRef.current = conexion;
      conexion.onRemoteStream = (stream) => setRemoteStream(stream);
      conexion.onEstadoCambiado = (pcEstado) => {
        if (pcEstado === 'connected') {
          if (desconexionRef.current) {
            clearTimeout(desconexionRef.current);
            desconexionRef.current = null;
          }
          fijarEstado('activa');
        }
        if (pcEstado === 'failed') colgar('error');
        // 'disconnected' es transitorio (un lag de red breve pasa por acá
        // sin que la llamada esté realmente perdida) — se le da 10s de
        // gracia para reconectar solo antes de cortar.
        if (pcEstado === 'disconnected' && !desconexionRef.current) {
          desconexionRef.current = setTimeout(() => colgar('desconexion'), TIMEOUT_DESCONEXION_MS);
        }
      };

      // Negar el micrófono no debe tirar abajo la llamada entera — sigue
      // sin audio propio, recibiendo el del otro lado igual (tabla de
      // errores del spec de diseño).
      try {
        await conexion.activarMicrofono();
      } catch {
        setError('No se pudo activar el micrófono. La llamada sigue sin tu audio.');
      }
      if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada durante activarMicrofono

      timeoutConexionRef.current = setTimeout(() => {
        if (estadoRef.current !== 'activa') colgar('error');
      }, TIMEOUT_CONEXION_MS);

      if (soyOfertante) {
        const oferta = await conexion.crearOferta();
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras armaba la oferta
        await mandarSenal(llamada.id, 'offer', oferta);
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras mandaba la oferta
      }

      // Poll de señales — solo mientras dura el handshake (oferta+respuesta
      // es todo el intercambio; se apaga solo apenas llega la que faltaba).
      signalPollRef.current = setInterval(async () => {
        if (negociarGenRef.current !== miGen) {
          if (signalPollRef.current) {
            clearInterval(signalPollRef.current);
            signalPollRef.current = null;
          }
          cerrarSiHuerfana();
          return;
        }
        const senales = await leerSenales(llamada.id, ultimaSenalRef.current);
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras leía señales
        let negociada = false;
        for (const s of senales) {
          ultimaSenalRef.current = Math.max(ultimaSenalRef.current, s.id);
          if (!soyOfertante && s.kind === 'offer') {
            const respuesta = await conexion.crearRespuesta(s.payload);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras armaba la respuesta
            await mandarSenal(llamada.id, 'answer', respuesta);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras mandaba la respuesta
            negociada = true;
          } else if (soyOfertante && s.kind === 'answer') {
            await conexion.aplicarRespuesta(s.payload);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras aplicaba la respuesta
            negociada = true;
          }
        }
        if (negociada && signalPollRef.current) {
          clearInterval(signalPollRef.current);
          signalPollRef.current = null;
        }
      }, 1500);
    } catch {
      // Si esta negociación ya no es la vigente (se canceló mientras el
      // await que reventó estaba en vuelo), no toques el estado de la
      // llamada actual ni conexionRef (puede ser de una invocación
      // posterior) — solo cerrá la conexión propia de esta instancia, si
      // llegó a crear una.
      if (negociarGenRef.current !== miGen) {
        cerrarSiHuerfana();
        return;
      }
      colgar('error');
    }
  }, [colgar]);

  useEffect(() => {
    if (!call) return;
    if (call.status === 'activa' && callIdEnCursoRef.current !== call.id) {
      negociar(call, role === 'user'); // el que acepta ofrece
    }
    if ((call.status === 'terminada' || call.status === 'rechazada') && estadoRef.current !== 'inactiva') {
      limpiar();
    }
  }, [call, role, negociar, limpiar]);

  useEffect(() => () => limpiar(), [limpiar]);

  const alternarMicrofono = useCallback(() => {
    setMicActivo((prev) => {
      const nuevo = !prev;
      conexionRef.current?.silenciarMicrofono(!nuevo);
      return nuevo;
    });
  }, []);

  const alternarPantalla = useCallback(async () => {
    const conexion = conexionRef.current;
    if (!conexion) return;
    if (conexion.compartiendoPantalla()) {
      conexion.dejarDeCompartirPantalla();
      setCompartiendoPantalla(false);
    } else {
      try {
        await conexion.compartirPantalla(() => setCompartiendoPantalla(false));
        setCompartiendoPantalla(true);
      } catch {
        // Picker nativo cancelado — no es un error a mostrar.
      }
    }
  }, []);

  return { estado, error, micActivo, compartiendoPantalla, remoteStream, alternarMicrofono, alternarPantalla, colgar };
}
