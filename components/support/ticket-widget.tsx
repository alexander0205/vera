'use client';

/**
 * Widget flotante de Zero Tickets. La lógica vive en useTicketChat, compartida
 * con /soporte (la ruta de pantalla completa).
 */

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Maximize2, Minimize2, X, Paperclip, Camera, Send, Sparkles, MessageCircle, RotateCcw, Clock, LifeBuoy, Phone } from 'lucide-react';
import { useTicketChat } from '@/lib/hooks/useTicketChat';
import { ImageLightbox } from '@/components/support/image-lightbox';
import { CapturaOverlay } from '@/components/support/captura-overlay';
import { MessageBubble } from '@/components/support/message-bubble';
import { InvitacionLlamada } from '@/components/support/invitacion-llamada';
import { PanelLlamada } from '@/components/support/panel-llamada';
import { useSoporte } from './soporte-context';
import { useAsistente } from './asistente/use-asistente';
import { PanelAsistente } from './asistente/panel-asistente';
import est from './asistente/asistente.module.css';
import { ANCHO_AMPLIO, ANCHO_ANCLADO, useAnclado } from './asistente/use-anclado';
import { LlamadaFinalizada } from '@/components/support/llamada-finalizada';
import { useLlamadaGlobal } from '@/lib/webrtc/LlamadaGlobalProvider';
import { useLlamadaFinalizadaReciente } from '@/lib/webrtc/useLlamadaFinalizadaReciente';
import { responderLlamada } from '@/lib/webrtc/senalizacion';
import { reproducirTonoLlamada } from '@/lib/webrtc/tonoLlamada';

const ADJUNTO_TITLE = 'Adjuntar imagen, video o PDF (máx. 15MB)';
const CAPTURA_TITLE = 'Capturar esta pantalla y adjuntarla al chat';

export function TicketWidget() {
  // El abierto/cerrado vive en el contexto: lo comparte con el botón de la
  // barra superior, que es quien lo dispara desde que se fue el flotante.
  const soporte = useSoporte();
  const open = soporte?.abierto ?? false;
  const setOpen = (v: boolean) => (v ? soporte?.abrir() : soporte?.cerrar());
  const chat = useTicketChat(open);
  // El asistente (solo lectura) es para dueños y administradores: si no aplica,
  // `disponible` queda en false y todo sigue siendo el soporte de siempre.
  // Se precarga poco después de montar: al abrir el panel ya se sabe si hay asistente
  // y las pestañas aparecen de una vez, sin pasar antes por la vista de soporte.
  const [precarga, setPrecarga] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPrecarga(true), 800);
    return () => clearTimeout(t);
  }, []);
  const asistente = useAsistente(open || precarga);
  const conAsistente = asistente.estado === 'listo';
  // Si la carga había fallado, ABRIR el panel es motivo para volver a intentarlo (una vez por apertura).
  const { estado: estadoAsistente, reintentarCarga } = asistente;
  const estadoAsistenteRef = useRef(estadoAsistente);
  estadoAsistenteRef.current = estadoAsistente;
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (open && !estabaAbierto.current && estadoAsistenteRef.current === 'error') void reintentarCarga();
    estabaAbierto.current = open;
  }, [open, reintentarCarga]);
  // En pantallas anchas el panel es una columna fija a la derecha y la página
  // se hace a un lado; en pantallas angostas flota encima, como antes.
  // Modo amplio: la columna pasa de 420 a 640 px (se recuerda en este navegador).
  const [amplio, setAmplio] = useState(false);
  useEffect(() => {
    try { setAmplio(localStorage.getItem('zero:asistente-amplio') === '1'); } catch { /* sin almacenamiento: normal */ }
  }, []);
  const alternarAmplio = () => setAmplio((v) => {
    const n = !v;
    try { localStorage.setItem('zero:asistente-amplio', n ? '1' : '0'); } catch { /* ignorado */ }
    return n;
  });
  const anchoColumna = amplio ? ANCHO_AMPLIO : ANCHO_ANCLADO;
  const anclado = useAnclado(open, anchoColumna);
  const [modo, setModo] = useState<'asistente' | 'soporte'>('asistente');
  // La conexión WebRTC vive en un provider único montado en el layout raíz
  // (LlamadaGlobalProvider) — nunca este componente. Si este widget se
  // desmonta (p.ej. al navegar a una ruta excluida, ver TicketWidgetGate),
  // la llamada sigue viva ahí arriba; acá solo se LEE su estado.
  const { call, ...llamada } = useLlamadaGlobal();
  const finalizadaReciente = useLlamadaFinalizadaReciente(call);
  // Vista dentro del widget abierto: 'chat' o 'llamada'. Al aceptar/recibir
  // una llamada activa se cambia sola a 'llamada'; el usuario puede volver a
  // 'chat' con la llamada igual conectada de fondo (el hook no depende de
  // qué vista esté mostrando).
  const [vista, setVista] = useState<'chat' | 'llamada'>('chat');

  useEffect(() => {
    if (call?.status === 'activa') setVista('llamada');
  }, [call?.status]);

  // Al colgar, `call` pasa a null (el poll solo trae pendiente/activa) y
  // `finalizadaReciente` se prende 2.5s para mostrar el aviso de "Llamada
  // finalizada" — pero pasado ESE plazo, sin este efecto, la vista se quedaba
  // clavada en 'llamada' con nada que mostrar (ni el aviso, que ya expiró, ni
  // el chat, tapado por `vista === 'llamada'') — el widget quedaba vacío
  // hasta recargar la página. Apenas no hay ni llamada activa ni aviso
  // reciente que mostrar, vuelve solo al chat.
  useEffect(() => {
    if (call?.status !== 'activa' && !finalizadaReciente) setVista('chat');
  }, [call?.status, finalizadaReciente]);

  // Chime suave apenas entra una invitación — edge-triggered contra el ref,
  // no contra el poll: sin esto sonaría de nuevo en cada tick mientras siga
  // 'pendiente'.
  const pendienteAvisadoRef = useRef(false);
  useEffect(() => {
    const pendiente = call?.status === 'pendiente';
    if (pendiente && !pendienteAvisadoRef.current) {
      pendienteAvisadoRef.current = true;
      reproducirTonoLlamada();
    }
    if (!pendiente) pendienteAvisadoRef.current = false;
  }, [call?.status]);

  // Sin try/catch acá — InvitacionLlamada maneja el estado optimista y
  // muestra el error inline si el POST falla, en vez de un window.alert. Ya
  // no redirige a /dashboard/soporte: la llamada queda en segundo plano en
  // este mismo widget, el usuario sigue donde estaba.
  async function responderInvitacion(accept: boolean) {
    if (!call) return;
    await responderLlamada(call.id, accept);
    // La llamada pasa a 'activa' en el servidor; preguntar ya en vez de
    // esperar al próximo turno del sondeo para empezar a conectar.
    llamada.refrescar();
    if (accept) setOpen(true);
  }

  // Una llamada en curso o entrante siempre se atiende en la vista de soporte.
  useEffect(() => {
    if (call?.status === 'activa' || call?.status === 'pendiente') setModo('soporte');
  }, [call?.status]);

  // Mientras se averigua si hay asistente no se muestra el soporte para cambiarlo después.
  const modoEfectivo: 'asistente' | 'soporte' | 'cargando' =
    asistente.estado === 'cargando' ? 'cargando' : conAsistente ? modo : 'soporte';

  // Punto en «Soporte» cuando un agente respondió y no lo has visto.
  const ultimoAgenteId = [...chat.messages].reverse().find((m) => m.senderType === 'agent')?.id ?? null;
  const [vistoAgenteId, setVistoAgenteId] = useState<number | null>(null);
  useEffect(() => {
    if (open && modoEfectivo === 'soporte') setVistoAgenteId(ultimoAgenteId);
  }, [open, modoEfectivo, ultimoAgenteId]);
  const soporteSinLeer =
    conAsistente && modoEfectivo === 'asistente' && ultimoAgenteId != null && ultimoAgenteId !== vistoAgenteId
    && (chat.status === 'abierto' || chat.status === 'esperando');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Widget minimizado con llamada activa: el audio tiene que seguir sonando
  // igual — este <audio> vive fuera de PanelLlamada (que ahí no está
  // montado) y se activa solo mientras `!open`, para no duplicar el audio
  // cuando el panel completo ya se encarga de reproducirlo.
  const audioMinimizadoRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (open || !llamada.remoteStream || !audioMinimizadoRef.current) return;
    audioMinimizadoRef.current.srcObject = llamada.remoteStream;
    audioMinimizadoRef.current.volume = 1;
    audioMinimizadoRef.current.play().catch(() => {});
  }, [open, llamada.remoteStream]);

  function scrollToBottom() {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }

  // Abrir el chat, o que llegue un mensaje nuevo, debe dejarte viendo lo más
  // reciente — no el arranque de la conversación. Sin esto la captura de
  // pantalla también salía mostrando el chat scrolleado arriba del todo,
  // porque captura el DOM tal cual está en ese momento.
  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [open, chat.messages, chat.pending]);

  if (!open) {
    // Cerrado no significa desmontado: si hay una llamada viva, su audio tiene
    // que seguir sonando aunque el panel no esté a la vista. El resto de la UI
    // sí se va — el disparador ahora vive en la barra superior.
    const llamadaEnCurso = llamada.estado === 'activa';
    return llamadaEnCurso ? <audio ref={audioMinimizadoRef} /> : null;
  }

  return (
    <>
    {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    {(chat.busyStage === 'capturando' || chat.busyStage === 'subiendo') && (
      <CapturaOverlay stage={chat.busyStage} />
    )}
    <div ref={panelRef} className={`${est.panel} ${anclado ? est.panelFijo : ''} ${amplio ? est.panelAmplio : ''}`}
      style={{ '--asistente-ancho': `${anchoColumna}px` } as React.CSSProperties}
      role="dialog" aria-label="Asistencia y soporte">
      <div className={est.cabecera}>
        <span className={est.marca} aria-hidden>
          {modoEfectivo === 'soporte' ? <MessageCircle size={17} /> : <Sparkles size={17} />}
        </span>
        <div className={est.titulos}>
          <p className={est.titulo}>{modoEfectivo === 'asistente' ? 'Asistente de Zero' : modoEfectivo === 'cargando' ? 'Asistencia' : 'Soporte'}</p>
          <p className={est.subtitulo}>
            {modoEfectivo === 'asistente'
              ? (asistente.perfil.empresa ?? 'Tu negocio, a una pregunta')
              : modoEfectivo === 'cargando'
                ? 'Un momento…'
                : 'Te atiende una persona del equipo'}
          </p>
        </div>
        <div className={est.acciones}>
          <button
            type="button" className={`${est.icono} ${est.botonAmplio}`} onClick={alternarAmplio}
            title={amplio ? 'Reducir el panel' : 'Ampliar el panel'} aria-label={amplio ? 'Reducir el panel' : 'Ampliar el panel'} aria-pressed={amplio}
          >
            {amplio ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {modoEfectivo === 'asistente' && asistente.mensajes.length > 0 && (
            <button type="button" className={est.icono} onClick={asistente.nueva} title="Nueva conversación" aria-label="Nueva conversación">
              <RotateCcw size={16} />
            </button>
          )}
          {modoEfectivo === 'soporte' && (
            <Link href="/dashboard/soporte" className={est.icono} title="Abrir en pantalla completa" aria-label="Abrir en pantalla completa">
              <Maximize2 size={16} />
            </Link>
          )}
          <button type="button" className={est.icono} onClick={() => setOpen(false)} title="Cerrar" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
      </div>

      {modoEfectivo === 'cargando' && (
        <div className={est.cargandoAsistencia} role="status" aria-live="polite">
          <span className={est.esqueleto} style={{ width: '100%', height: 36 }} />
          <span className={est.esqueleto} style={{ width: '70%' }} />
          <span className={est.esqueleto} style={{ width: '85%' }} />
          <span className={est.esqueleto} style={{ width: '55%' }} />
          <span className="sr-only">Cargando el asistente…</span>
        </div>
      )}

      {asistente.estado === 'error' && (
        <div className={est.avisoAsistente} role="alert">
          <span>No pude cargar el asistente.</span>
          <button type="button" onClick={() => void asistente.reintentarCarga()}>Reintentar</button>
        </div>
      )}

      {conAsistente && (
        <div className={est.segmentos} role="tablist" aria-label="Con quién hablar">
          <button
            type="button" role="tab" aria-selected={modoEfectivo === 'asistente'}
            className={`${est.segmento} ${modoEfectivo === 'asistente' ? est.segmentoActivo : ''}`}
            onClick={() => setModo('asistente')}
          >
            <Sparkles size={14} aria-hidden /> Asistente
          </button>
          <button
            type="button" role="tab" aria-selected={modoEfectivo === 'soporte'}
            className={`${est.segmento} ${modoEfectivo === 'soporte' ? est.segmentoActivo : ''}`}
            onClick={() => setModo('soporte')}
          >
            <MessageCircle size={14} aria-hidden /> Soporte
            {soporteSinLeer && <span className={est.punto} aria-label="Respuesta nueva" />}
          </button>
        </div>
      )}

      {modoEfectivo === 'asistente' && (
        <PanelAsistente a={asistente} onDerivada={() => setModo('soporte')} onIrASoporte={() => setModo('soporte')} />
      )}

      {modoEfectivo === 'soporte' && (call?.status === 'activa' || finalizadaReciente) && (
        <div className={est.pestanas} role="tablist" aria-label="Chat o llamada">
          <button
            type="button" role="tab" aria-selected={vista === 'chat'}
            className={`${est.pestana} ${vista === 'chat' ? est.pestanaActiva : ''}`}
            onClick={() => setVista('chat')}
          >
            Chat
          </button>
          <button
            type="button" role="tab" aria-selected={vista === 'llamada'}
            className={`${est.pestana} ${vista === 'llamada' ? est.pestanaActiva : ''}`}
            onClick={() => setVista('llamada')}
          >
            Llamada
          </button>
        </div>
      )}

      {modoEfectivo === 'soporte' && vista === 'llamada' && (finalizadaReciente || call?.status === 'activa') && (
        <div className={est.zonaLlamada}>
          {finalizadaReciente && call?.status !== 'activa' ? (
            <div className={est.llamadaFin}>
              <LlamadaFinalizada />
            </div>
          ) : (
            <PanelLlamada
              estado={llamada.estado}
              error={llamada.error}
              micActivo={llamada.micActivo}
              compartiendoPantalla={llamada.compartiendoPantalla}
              videoRemotoActivo={llamada.videoRemotoActivo}
              remoteStream={llamada.remoteStream}
              onAlternarMicrofono={llamada.alternarMicrofono}
              onAlternarPantalla={llamada.alternarPantalla}
              onColgar={() => llamada.colgar('colgada')}
            />
          )}
        </div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && chat.status === 'esperando' && chat.espera && (
        <div className={`${est.aviso} ${est.avisoEspera}`} role="status">
          <Clock size={14} aria-hidden />
          <span>
            {chat.espera.agentesDisponibles === 0
              ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
              : `Tiempo de espera estimado: ${chat.espera.esperaMinutos} min (posición en cola: ${chat.espera.enCola})`}
          </span>
        </div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && call?.status === 'pendiente' && (
        <InvitacionLlamada
          nombreAgente={call.requestedByName ?? null}
          onAceptar={() => responderInvitacion(true)}
          onRechazar={() => responderInvitacion(false)}
        />
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && (
        <div ref={listRef} className={est.hilo} role="log" aria-live="polite" aria-label="Conversación con soporte">
          {chat.historialCargado && chat.messages.length + chat.pending.length === 0 && !chat.loading && (
            <div className={est.vacioSoporte}>
              <span className={est.vacioIcono} aria-hidden><LifeBuoy size={22} /></span>
              <h3>¿En qué te ayudamos?</h3>
              <p>Cuéntanos qué pasó o qué necesitas. Una persona del equipo te responde aquí mismo.</p>
              <ul className={est.vacioPistas}>
                <li><Camera size={14} aria-hidden /> Puedes adjuntar una captura de tu pantalla</li>
                <li><Phone size={14} aria-hidden /> Si hace falta, te llamamos desde este chat</li>
              </ul>
            </div>
          )}
          {[...chat.messages, ...chat.pending].map((m, i) => {
            const key = m.id != null ? `msg-${m.id}` : `tmp-${i}`;
            const mine = m.senderType === 'user';
            const leido = mine && chat.readByAgentAt != null && new Date(m.createdAt) <= new Date(chat.readByAgentAt);
            return (
              <MessageBubble
                key={key}
                message={m}
                mine={mine}
                leido={leido}
                colorMio="var(--primary)"
                loading={chat.loading}
                onCapture={() => chat.captureScreenshot(panelRef.current)}
                onAttach={() => fileInputRef.current?.click()}
                onImageClick={setLightbox}
                onImageLoad={scrollToBottom}
                capturaTitle={CAPTURA_TITLE}
                adjuntoTitle={ADJUNTO_TITLE}
              />
            );
          })}
          {chat.agentTyping && (
            <div className={est.escribiendo}>
              <span className={est.puntos} aria-hidden><i /><i /><i /></span>
              El agente está escribiendo…
            </div>
          )}
          {chat.busyStage === 'enviando' && <div className={est.enviandoMsg}>Enviando…</div>}
        </div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && chat.status === 'cerrado' && (
        <div className={`${est.aviso} ${est.avisoCerrado}`}>Este ticket fue cerrado. Escribe para reabrirlo.</div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && chat.showRating && (
        <div className={est.calificacion}>
          <p className={est.calificacionTitulo}>¿Cómo calificas la atención recibida?</p>
          <div className={est.estrellas}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => chat.setRatingValue(n)}
                className={`${est.estrella} ${n <= chat.ratingValue ? est.estrellaOn : ''}`}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                aria-pressed={n <= chat.ratingValue}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={chat.ratingComment}
            onChange={(e) => chat.setRatingComment(e.target.value)}
            placeholder="Comentario (opcional)"
            rows={2}
            className={est.comentario}
            aria-label="Comentario sobre la atención"
          />
          <button
            type="button"
            onClick={chat.submitRating}
            disabled={chat.ratingValue < 1 || chat.ratingLoading}
            className={est.btnPrimario}
          >
            {chat.ratingLoading ? 'Enviando…' : 'Enviar calificación'}
          </button>
        </div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && chat.ratingSubmitted && (
        <div className={`${est.aviso} ${est.avisoOk}`} role="status">¡Gracias por tu calificación!</div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && chat.status === 'abierto' && chat.onHold && (
        <div className={`${est.aviso} ${est.avisoNeutro}`}>Tu ticket está en espera mientras el agente investiga.</div>
      )}

      {modoEfectivo === 'soporte' && vista === 'chat' && (
        <div className={est.pie}>
          <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={chat.onFileSelected} style={{ display: 'none' }} />
          <div className={est.compositor}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={ADJUNTO_TITLE}
              aria-label="Adjuntar archivo"
              className={est.herramienta}
            >
              <Paperclip size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => chat.captureScreenshot(panelRef.current)}
              title={CAPTURA_TITLE}
              aria-label="Capturar esta pantalla"
              disabled={chat.loading}
              className={est.herramienta}
            >
              <Camera size={18} aria-hidden />
            </button>
            <input
              id="soporte-texto"
              value={chat.input}
              onChange={(e) => chat.onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && chat.send()}
              placeholder="Escribe un mensaje…"
              aria-label="Mensaje para soporte"
              className={est.campoLinea}
            />
            <button
              type="button"
              onClick={chat.send}
              title="Enviar mensaje"
              aria-label="Enviar mensaje"
              className={est.enviar}
            >
              <Send size={17} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
