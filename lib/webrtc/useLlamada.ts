'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConexionLlamada, TIMEOUT_CONEXION_MS } from './conexion';
import { mandarSenal, leerSenales, terminarLlamada, obtenerIceServers, type LlamadaDTO } from './senalizacion';
import { GrabacionLlamada } from './grabacionLlamada';

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
  // Si de verdad están llegando frames de video NUEVOS ahora mismo — no si
  // el track "existe" ni si el browser lo marca `muted` (esa señal resultó
  // no ser confiable: ver el comentario largo en ConexionLlamada). Esto
  // viene de medir `framesDecoded` real vía getStats(), así que refleja
  // tanto cuando alguien empieza a compartir como cuando corta, sin
  // depender de ningún evento del navegador.
  const [videoRemotoActivo, setVideoRemotoActivo] = useState(false);

  const estadoRef = useRef<EstadoLlamada>('inactiva');
  const conexionRef = useRef<ConexionLlamada | null>(null);
  const grabacionRef = useRef<GrabacionLlamada | null>(null);
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
    grabacionRef.current?.detener();
    grabacionRef.current = null;
    callIdEnCursoRef.current = null;
    ultimaSenalRef.current = 0;
    setRemoteStream(null);
    setVideoRemotoActivo(false);
    setCompartiendoPantalla(false);
    fijarEstado(mensajeError ? 'error' : 'inactiva');
    setError(mensajeError ?? null);
  }, []);

  const colgar = useCallback(async (reason: string = 'colgada') => {
    const id = callIdEnCursoRef.current;
    // Esperar la confirmación del server ANTES de limpiar el estado local —
    // si no, hay una ventana donde ya limpiamos `callIdEnCursoRef` (queda en
    // null) pero el PATCH que marca la llamada como terminada todavía no
    // llegó a la DB. Un poll que caiga justo ahí sigue viendo `status:
    // 'activa'` del lado del server y, como el ref ya está en null, el
    // efecto de abajo lo lee como "llamada activa nueva, todavía no
    // negociada" y arranca `negociar()` de nuevo — de ahí el parpadeo de
    // "Conectando…" justo después de colgar. Esperando acá, para cuando el
    // ref se limpia el server YA confirma terminada, así que ningún poll
    // puede leerla como activa.
    if (id) await terminarLlamada(id, reason).catch(() => {});
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
      if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; }
      conexionRef.current = conexion;
      conexion.onRemoteStream = (stream) => setRemoteStream(stream);
      conexion.onVideoActivoCambiado = (activo) => setVideoRemotoActivo(activo);
      let micActivadoOEnCurso = false;
      const activarMicrofonoAlConectar = async () => {
        // El mic se activa acá —cuando la conexión YA está en 'connected'—
        // y no antes de negociar como se hacía originalmente. Confirmado con
        // logs reales: `replaceTrack()` llamado ANTES de que el transporte
        // DTLS/SRTP esté armado deja el track adjuntado del lado del sender,
        // pero el otro lado nunca lo ve salir de `muted` — la señalización
        // negocia bien (llega el ontrack, hay receiver) pero jamás fluye
        // audio real. Screen-share ya se activa post-conexión (por acción
        // del usuario) y ahí sí funciona siempre — este es el mismo momento.
        if (micActivadoOEnCurso) return;
        micActivadoOEnCurso = true;
        // getUserMedia/getDisplayMedia no existen fuera de un contexto seguro
        // (https://, o localhost). Entrar por la IP de red del server en
        // http:// —como http://10.x.x.x:3000— es exactamente ese caso: la
        // llamada negocia bien (la señalización es texto plano por HTTP, no
        // necesita nada especial) pero nunca hay media de ningún lado, sin
        // ningún error visible salvo que se chequee esto explícitamente.
        if (!navigator.mediaDevices) {
          setError('Este navegador no permite usar micrófono/cámara en esta dirección. Si entraste por una IP de red (http://10.x.x.x) en vez de localhost o un dominio con HTTPS, hace falta un túnel o desplegar con SSL.');
          return;
        }
        // Negar el micrófono no debe tirar abajo la llamada entera — sigue
        // sin audio propio, recibiendo el del otro lado igual (tabla de
        // errores del spec de diseño).
        try {
          await conexion.activarMicrofono();
        } catch (e) {
          const detalle = e instanceof Error ? e.message : 'motivo desconocido';
          setError(`No se pudo activar el micrófono (${detalle}). La llamada sigue sin tu audio.`);
        }
        grabacionRef.current = new GrabacionLlamada(llamada.id, role);
        grabacionRef.current.actualizarStream(conexion.obtenerStreamLocal());
      };
      conexion.onEstadoCambiado = (pcEstado) => {
        // Este callback vive en el closure de `conexion` y puede disparar en
        // cualquier momento futuro, mucho después de que esta invocación
        // haya quedado obsoleta (p.ej. su RTCPeerConnection huérfana pasa a
        // 'failed' bastante después de que otra invocación ya la reemplazó).
        // Sin este chequeo, una conexión huérfana podría llamar colgar() y
        // destruir el estado de la invocación realmente vigente.
        if (negociarGenRef.current !== miGen) return;
        if (pcEstado === 'connected') {
          if (desconexionRef.current) {
            clearTimeout(desconexionRef.current);
            desconexionRef.current = null;
          }
          fijarEstado('activa');
          activarMicrofonoAlConectar();
        }
        if (pcEstado === 'failed') colgar('error');
        // 'disconnected' es transitorio (un lag de red breve pasa por acá
        // sin que la llamada esté realmente perdida) — se le da 10s de
        // gracia para reconectar solo antes de cortar.
        if (pcEstado === 'disconnected' && !desconexionRef.current) {
          desconexionRef.current = setTimeout(() => colgar('desconexion'), TIMEOUT_DESCONEXION_MS);
        }
      };

      timeoutConexionRef.current = setTimeout(() => {
        if (estadoRef.current !== 'activa') colgar('error');
      }, TIMEOUT_CONEXION_MS);

      if (soyOfertante) {
        const oferta = await conexion.crearOferta();
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras armaba la oferta
        await mandarSenal(llamada.id, 'offer', oferta, role);
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras mandaba la oferta
      }

      // Poll de señales — solo mientras dura el handshake (oferta+respuesta
      // es todo el intercambio; se apaga solo apenas llega la que faltaba).
      // intervalLocal identifica el intervalo de ESTA invocación — antes de
      // limpiar signalPollRef.current hay que confirmar que sigue apuntando
      // a este mismo handle, porque una invocación más nueva puede haberlo
      // reemplazado por el suyo propio.
      // Sin esto, si leerSenales/crearRespuesta/mandarSenal tardan más que
      // 1.5s (DB lenta) el próximo tick del interval dispara una lectura
      // nueva encima de la que sigue en vuelo — mismo bug que
      // messagesInFlightRef en app/zero-tickets/page.tsx, acá aplicado al
      // poll de señales.
      let tickEnCurso = false;
      const intervalLocal: ReturnType<typeof setInterval> = setInterval(async () => {
        if (tickEnCurso) return;
        tickEnCurso = true;
        try {
          await tickSenal();
        } catch {
          // Sin este catch, una señal que falla se volvía unhandled rejection
          // y Next la mostraba como Runtime Error en pantalla. El caso normal
          // es un 409 "La llamada ya terminó": el otro lado colgó mientras
          // este tick estaba en vuelo. No hay nada que reintentar — se corta
          // el poll y el poll de estado de la llamada se encarga del resto.
          clearInterval(intervalLocal);
          if (signalPollRef.current === intervalLocal) signalPollRef.current = null;
        } finally {
          tickEnCurso = false;
        }
        // 800ms y no 1500: este poll solo vive durante el handshake (se apaga
        // solo apenas llega la señal que faltaba), y cada tick de más se suma
        // directo al tiempo que tarda la llamada en conectar. El guard de
        // arriba evita que acortarlo amontone requests.
      }, 800);
      async function tickSenal() {
        if (negociarGenRef.current !== miGen) {
          // clearInterval sobre el handle LOCAL siempre corre — parar el
          // propio timer de esta invocación no depende de si el ref
          // compartido todavía lo referencia. Solo el nulleo del ref va
          // gateado por identidad, para no pisar el de una invocación más
          // nueva que ya lo reemplazó.
          clearInterval(intervalLocal);
          if (signalPollRef.current === intervalLocal) signalPollRef.current = null;
          cerrarSiHuerfana();
          return;
        }
        const senales = await leerSenales(llamada.id, ultimaSenalRef.current, role);
        if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras leía señales
        let negociada = false;
        for (const s of senales) {
          ultimaSenalRef.current = Math.max(ultimaSenalRef.current, s.id);
          if (!soyOfertante && s.kind === 'offer') {
            const respuesta = await conexion.crearRespuesta(s.payload);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras armaba la respuesta
            await mandarSenal(llamada.id, 'answer', respuesta, role);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras mandaba la respuesta
            negociada = true;
          } else if (soyOfertante && s.kind === 'answer') {
            await conexion.aplicarRespuesta(s.payload);
            if (negociarGenRef.current !== miGen) { cerrarSiHuerfana(); return; } // cancelada mientras aplicaba la respuesta
            negociada = true;
          }
        }
        if (negociada) {
          clearInterval(intervalLocal);
          if (signalPollRef.current === intervalLocal) signalPollRef.current = null;
        }
      }
      signalPollRef.current = intervalLocal;
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
  }, [colgar, role]);

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
      grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
    } else {
      try {
        await conexion.compartirPantalla(() => {
          setCompartiendoPantalla(false);
          grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
        });
        setCompartiendoPantalla(true);
        grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
      } catch (e) {
        // getDisplayMedia tira NotAllowedError tanto si el usuario cierra el
        // picker nativo como si el navegador lo bloquea de raíz (contexto
        // inseguro, política del navegador) — pero Chrome SÍ distingue los
        // dos casos en el texto del mensaje: "denied by user" es cancelación
        // normal (cerró el picker, no pasa nada raro), "denied by system" es
        // un bloqueo real. Mostrar el mismo error de SSL/túnel para un click
        // en "Cancelar" era el bug — asustaba con un mensaje que no aplicaba.
        const mensaje = e instanceof Error ? e.message : '';
        if (/denied by user/i.test(mensaje)) return;
        setError(`No se pudo compartir pantalla (${mensaje || 'motivo desconocido'}). Si entraste por una IP de red (http://10.x.x.x) en vez de localhost o un dominio con HTTPS, el navegador bloquea compartir pantalla directamente — hace falta un túnel o desplegar con SSL.`);
      }
    }
  }, []);

  return { estado, error, micActivo, compartiendoPantalla, remoteStream, videoRemotoActivo, alternarMicrofono, alternarPantalla, colgar };
}
