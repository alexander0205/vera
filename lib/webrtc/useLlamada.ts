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

  function fijarEstado(nuevo: EstadoLlamada) {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }

  const limpiar = useCallback((mensajeError?: string) => {
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
    fijarEstado('conectando');
    setError(null);
    try {
      const iceServers = await obtenerIceServers();
      const conexion = new ConexionLlamada(iceServers);
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

      timeoutConexionRef.current = setTimeout(() => {
        if (estadoRef.current !== 'activa') colgar('error');
      }, TIMEOUT_CONEXION_MS);

      if (soyOfertante) {
        const oferta = await conexion.crearOferta();
        await mandarSenal(llamada.id, 'offer', oferta);
      }

      // Poll de señales — solo mientras dura el handshake (oferta+respuesta
      // es todo el intercambio; se apaga solo apenas llega la que faltaba).
      signalPollRef.current = setInterval(async () => {
        const senales = await leerSenales(llamada.id, ultimaSenalRef.current);
        let negociada = false;
        for (const s of senales) {
          ultimaSenalRef.current = Math.max(ultimaSenalRef.current, s.id);
          if (!soyOfertante && s.kind === 'offer') {
            const respuesta = await conexion.crearRespuesta(s.payload);
            await mandarSenal(llamada.id, 'answer', respuesta);
            negociada = true;
          } else if (soyOfertante && s.kind === 'answer') {
            await conexion.aplicarRespuesta(s.payload);
            negociada = true;
          }
        }
        if (negociada && signalPollRef.current) {
          clearInterval(signalPollRef.current);
          signalPollRef.current = null;
        }
      }, 1500);
    } catch {
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
