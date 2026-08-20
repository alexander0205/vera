'use client';

/**
 * Versión de pantalla completa del chat de soporte.
 *
 * La videollamada con pantalla compartida va a vivir acá más adelante, pero
 * la va a PEDIR el agente por un mensaje del chat (como ya pasa con
 * "screenshot_request") — no hace falta reservarle columna propia de
 * antemano, así que el chat usa todo el ancho disponible.
 *
 * Vive en app/(dashboard)/dashboard/soporte — adentro del layout de
 * Facturación a propósito: es el MISMO rail y header que el resto de la app
 * (ver app/(dashboard)/dashboard/layout.tsx), no uno aparte a medio hacer.
 */

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Camera, Send } from 'lucide-react';
import { useTicketChat } from '@/lib/hooks/useTicketChat';
import { ImageLightbox } from '@/components/support/image-lightbox';
import { CapturaOverlay } from '@/components/support/captura-overlay';
import { MessageBubble } from '@/components/support/message-bubble';

const COLOR_MIO = '#3658e1';
const ADJUNTO_TITLE = 'Adjuntar imagen, video o PDF (máx. 15MB)';
const CAPTURA_TITLE = 'Capturar esta pantalla y adjuntarla al chat';

export function SoportePaginaCompleta() {
  const chat = useTicketChat(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  function scrollToBottom() {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }

  // Ver lo más reciente al entrar, no el arranque de la conversación — y que
  // la captura de pantalla (que rasteriza el DOM tal cual está) no salga
  // mostrando el scroll arriba del todo.
  useEffect(() => {
    scrollToBottom();
  }, [chat.messages, chat.pending]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {(chat.busyStage === 'capturando' || chat.busyStage === 'subiendo') && (
        <CapturaOverlay stage={chat.busyStage} />
      )}

      <div style={{ padding: '18px 28px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 19, color: '#0f172a' }}>Soporte</span>
      </div>

      {chat.status === 'esperando' && chat.espera && (
        <div style={{ padding: '10px 28px', fontSize: 12.5, background: '#fffbeb', color: '#92400e', textAlign: 'center', borderBottom: '1px solid #fde68a', flexShrink: 0 }}>
          {chat.espera.agentesDisponibles === 0
            ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
            : `Tiempo de espera estimado: ${chat.espera.esperaMinutos} min (posición en cola: ${chat.espera.enCola})`}
        </div>
      )}

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
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
              onCapture={() => chat.captureScreenshot()}
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
        <div style={{ padding: '10px 28px', fontSize: 12.5, color: '#92400e', background: '#fef3c7', textAlign: 'center', flexShrink: 0 }}>
          Este ticket fue cerrado. Escribe para reabrirlo.
        </div>
      )}

      {chat.showRating && (
        <div style={{ padding: '14px 28px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>¿Cómo calificás la atención recibida?</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => chat.setRatingValue(n)}
                style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1, color: n <= chat.ratingValue ? '#f59e0b' : '#d1d5db' }}
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
            style={{ resize: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', maxWidth: 480 }}
          />
          <button
            onClick={chat.submitRating}
            disabled={chat.ratingValue < 1 || chat.ratingLoading}
            style={{
              border: 'none', background: chat.ratingValue < 1 || chat.ratingLoading ? '#93a5f5' : COLOR_MIO, color: 'white',
              borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: chat.ratingValue < 1 || chat.ratingLoading ? 'default' : 'pointer', alignSelf: 'flex-start',
            }}
          >
            {chat.ratingLoading ? 'Enviando...' : 'Enviar calificación'}
          </button>
        </div>
      )}

      {chat.ratingSubmitted && (
        <div style={{ padding: '10px 28px', fontSize: 13, color: '#166534', background: '#dcfce7', textAlign: 'center', flexShrink: 0 }}>
          ¡Gracias por tu calificación!
        </div>
      )}

      {chat.status === 'abierto' && chat.onHold && (
        <div style={{ padding: '10px 28px', fontSize: 13, color: '#334155', background: '#f1f5f9', textAlign: 'center', flexShrink: 0 }}>
          Tu ticket está en espera mientras el agente investiga.
        </div>
      )}

      <div style={{ display: 'flex', borderTop: '1px solid #e2e8f0', alignItems: 'center', padding: '0 12px', flexShrink: 0 }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={chat.onFileSelected} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          title={ADJUNTO_TITLE}
          style={{ border: 'none', background: 'none', padding: '0 10px', cursor: 'pointer', display: 'flex', color: '#64748b' }}
        >
          <Paperclip size={20} />
        </button>
        <button
          onClick={() => chat.captureScreenshot()}
          title={CAPTURA_TITLE}
          disabled={chat.loading}
          style={{ border: 'none', background: 'none', padding: '0 10px', cursor: chat.loading ? 'default' : 'pointer', display: 'flex', color: '#64748b' }}
        >
          <Camera size={20} />
        </button>
        <input
          value={chat.input}
          onChange={(e) => chat.onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && chat.send()}
          placeholder="Escribe un mensaje..."
          style={{ flex: 1, border: 'none', padding: 16, fontSize: 15, outline: 'none' }}
        />
        <button
          onClick={chat.send}
          title="Enviar mensaje"
          style={{ border: 'none', background: COLOR_MIO, color: 'white', padding: '10px 20px', margin: '10px 0', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Send size={16} /> Enviar
        </button>
      </div>
    </div>
  );
}
