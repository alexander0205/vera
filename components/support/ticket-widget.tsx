'use client';

/**
 * Widget flotante de Zero Tickets. La lógica vive en useTicketChat, compartida
 * con /soporte (la ruta de pantalla completa).
 */

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Maximize2, X, Paperclip, Camera, Send } from 'lucide-react';
import { useTicketChat } from '@/lib/hooks/useTicketChat';
import { ImageLightbox } from '@/components/support/image-lightbox';
import { CapturaOverlay } from '@/components/support/captura-overlay';
import { MessageBubble } from '@/components/support/message-bubble';
import { InvitacionLlamada } from '@/components/support/invitacion-llamada';
import { responderLlamada } from '@/lib/webrtc/senalizacion';

const COLOR_MIO = '#3658e1';
const ADJUNTO_TITLE = 'Adjuntar imagen, video o PDF (máx. 15MB)';
const CAPTURA_TITLE = 'Capturar esta pantalla y adjuntarla al chat';

export function TicketWidget() {
  const [open, setOpen] = useState(false);
  const chat = useTicketChat(open);
  const router = useRouter();

  async function responderInvitacion(accept: boolean) {
    if (!chat.call) return;
    try {
      await responderLlamada(chat.call.id, accept);
      if (accept) router.push('/dashboard/soporte');
    } catch {
      window.alert('No se pudo responder la llamada.');
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

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
    return (
      <button
        onClick={() => setOpen(true)}
        title="Chatear con soporte"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%', background: '#3658e1',
          color: 'white', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <MessageCircle size={26} />
      </button>
    );
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
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        width: 360, height: 520, background: 'white',
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

      {chat.status === 'esperando' && chat.espera && (
        <div style={{ padding: '8px 12px', fontSize: 12, background: '#fffbeb', color: '#92400e', textAlign: 'center', borderBottom: '1px solid #fde68a' }}>
          {chat.espera.agentesDisponibles === 0
            ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
            : `Tiempo de espera estimado: ${chat.espera.esperaMinutos} min (posición en cola: ${chat.espera.enCola})`}
        </div>
      )}

      {chat.call?.status === 'pendiente' && (
        <InvitacionLlamada
          nombreAgente={chat.call.requestedByName ?? null}
          onAceptar={() => responderInvitacion(true)}
          onRechazar={() => responderInvitacion(false)}
        />
      )}

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

      {chat.status === 'cerrado' && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#92400e', background: '#fef3c7', textAlign: 'center' }}>
          Este ticket fue cerrado. Escribe para reabrirlo.
        </div>
      )}

      {chat.showRating && (
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

      {chat.ratingSubmitted && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#166534', background: '#dcfce7', textAlign: 'center' }}>
          ¡Gracias por tu calificación!
        </div>
      )}

      {chat.status === 'abierto' && chat.onHold && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#334155', background: '#f1f5f9', textAlign: 'center' }}>
          Tu ticket está en espera mientras el agente investiga.
        </div>
      )}

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
    </div>
    </>
  );
}
