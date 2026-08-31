'use client';

/**
 * Widget flotante de Zero Tickets. La lógica vive en useTicketChat, compartida
 * con /soporte (la ruta de pantalla completa).
 */

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Maximize2, X, Paperclip, Camera, Send } from 'lucide-react';
import { useTicketChat } from '@/lib/hooks/useTicketChat';
import { ImageLightbox } from '@/components/support/image-lightbox';
import { CapturaOverlay } from '@/components/support/captura-overlay';
import { MessageBubble } from '@/components/support/message-bubble';
import { InvitacionLlamada } from '@/components/support/invitacion-llamada';
import { PanelLlamada } from '@/components/support/panel-llamada';
import { useSoporte } from './soporte-context';
import { LlamadaFinalizada } from '@/components/support/llamada-finalizada';
import { useLlamadaGlobal } from '@/lib/webrtc/LlamadaGlobalProvider';
import { useLlamadaFinalizadaReciente } from '@/lib/webrtc/useLlamadaFinalizadaReciente';
import { responderLlamada } from '@/lib/webrtc/senalizacion';
import { reproducirTonoLlamada } from '@/lib/webrtc/tonoLlamada';

const COLOR_MIO = '#3658e1';
const ADJUNTO_TITLE = 'Adjuntar imagen, video o PDF (máx. 15MB)';
const CAPTURA_TITLE = 'Capturar esta pantalla y adjuntarla al chat';

export function TicketWidget() {
  // El abierto/cerrado vive en el contexto: lo comparte con el botón de la
  // barra superior, que es quien lo dispara desde que se fue el flotante.
  const soporte = useSoporte();
  const open = soporte?.abierto ?? false;
  const setOpen = (v: boolean) => (v ? soporte?.abrir() : soporte?.cerrar());
  const chat = useTicketChat(open);
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
    if (accept) setOpen(true);
  }

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
    <div
      ref={panelRef}
      style={{
        // Abajo a la derecha, que es donde la gente busca un chat. Lo probé
        // colgado de la barra superior —donde vive su botón— y se siente
        // fuera de sitio: un panel de conversación se espera en el pie.
        //
        // El tope de alto sí importa: sin él, en pantallas cortas el panel se
        // metía debajo de la barra superior. `100vh - 104px` lo deja siempre
        // por debajo del header, con sus 20px de margen inferior incluidos.
        position: 'fixed', bottom: 20, right: 20, zIndex: 1200,
        width: 360, height: 'min(520px, calc(100vh - 104px))', background: 'white',
        borderRadius: 16, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ background: '#3658e1', color: 'white', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Soporte</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Link
            href="/dashboard/soporte"
            title="Abrir en pantalla completa"
            style={{ color: 'white', opacity: 0.9, display: 'flex', alignItems: 'center' }}
          >
            <Maximize2 size={16} />
          </Link>
          <button
            onClick={() => setOpen(false)}
            title="Cerrar"
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {(call?.status === 'activa' || finalizadaReciente) && (
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button
            onClick={() => setVista('chat')}
            style={{
              flex: 1, border: 'none', background: 'none', padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              color: vista === 'chat' ? COLOR_MIO : '#64748b',
              borderBottom: vista === 'chat' ? `2px solid ${COLOR_MIO}` : '2px solid transparent',
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setVista('llamada')}
            style={{
              flex: 1, border: 'none', background: 'none', padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              color: vista === 'llamada' ? COLOR_MIO : '#64748b',
              borderBottom: vista === 'llamada' ? `2px solid ${COLOR_MIO}` : '2px solid transparent',
            }}
          >
            Llamada
          </button>
        </div>
      )}

      {vista === 'llamada' && (finalizadaReciente || call?.status === 'activa') && (
        <div style={{ flex: 1, minHeight: 0 }}>
          {finalizadaReciente && call?.status !== 'activa' ? (
            <div style={{ padding: 16, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
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

      {vista === 'chat' && chat.status === 'esperando' && chat.espera && (
        <div style={{ padding: '8px 12px', fontSize: 12, background: '#fffbeb', color: '#92400e', textAlign: 'center', borderBottom: '1px solid #fde68a' }}>
          {chat.espera.agentesDisponibles === 0
            ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
            : `Tiempo de espera estimado: ${chat.espera.esperaMinutos} min (posición en cola: ${chat.espera.enCola})`}
        </div>
      )}

      {vista === 'chat' && call?.status === 'pendiente' && (
        <InvitacionLlamada
          nombreAgente={call.requestedByName ?? null}
          onAceptar={() => responderInvitacion(true)}
          onRechazar={() => responderInvitacion(false)}
        />
      )}

      {vista === 'chat' && (
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc' }}>
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
              colorMio={COLOR_MIO}
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
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginLeft: 2 }}>El agente está escribiendo...</div>
        )}
        {chat.busyStage === 'enviando' && (
          <div style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'flex-end', marginRight: 2 }}>enviando...</div>
        )}
      </div>
      )}

      {vista === 'chat' && chat.status === 'cerrado' && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#92400e', background: '#fef3c7', textAlign: 'center' }}>
          Este ticket fue cerrado. Escribe para reabrirlo.
        </div>
      )}

      {vista === 'chat' && chat.showRating && (
        <div style={{ padding: 10, background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>¿Cómo calificás la atención recibida?</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => chat.setRatingValue(n)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, color: n <= chat.ratingValue ? '#f59e0b' : '#d1d5db' }}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
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
            style={{ resize: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={chat.submitRating}
            disabled={chat.ratingValue < 1 || chat.ratingLoading}
            style={{
              border: 'none', background: chat.ratingValue < 1 || chat.ratingLoading ? '#a8b8ee' : '#3658e1', color: 'white',
              borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: chat.ratingValue < 1 || chat.ratingLoading ? 'default' : 'pointer',
            }}
          >
            {chat.ratingLoading ? 'Enviando...' : 'Enviar calificación'}
          </button>
        </div>
      )}

      {vista === 'chat' && chat.ratingSubmitted && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#166534', background: '#dcfce7', textAlign: 'center' }}>
          ¡Gracias por tu calificación!
        </div>
      )}

      {vista === 'chat' && chat.status === 'abierto' && chat.onHold && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#334155', background: '#f1f5f9', textAlign: 'center' }}>
          Tu ticket está en espera mientras el agente investiga.
        </div>
      )}

      {vista === 'chat' && (
      <div style={{ display: 'flex', borderTop: '1px solid #eee', alignItems: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={chat.onFileSelected} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          title={ADJUNTO_TITLE}
          style={{ border: 'none', background: 'none', padding: '0 8px', cursor: 'pointer', display: 'flex', color: '#64748b' }}
        >
          <Paperclip size={19} />
        </button>
        <button
          onClick={() => chat.captureScreenshot(panelRef.current)}
          title={CAPTURA_TITLE}
          disabled={chat.loading}
          style={{ border: 'none', background: 'none', padding: '0 8px', cursor: chat.loading ? 'default' : 'pointer', display: 'flex', color: '#64748b' }}
        >
          <Camera size={19} />
        </button>
        <input
          value={chat.input}
          onChange={(e) => chat.onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && chat.send()}
          placeholder="Escribe un mensaje..."
          style={{ flex: 1, border: 'none', padding: 10, fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={chat.send}
          title="Enviar mensaje"
          style={{ border: 'none', background: '#3658e1', color: 'white', padding: '0 16px', height: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Send size={17} />
        </button>
      </div>
      )}
    </div>
    </>
  );
}
