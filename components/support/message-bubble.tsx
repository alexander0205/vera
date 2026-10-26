'use client';

/**
 * Una burbuja del chat de soporte — compartida entre el panel flotante y
 * /dashboard/soporte para que no diverjan en dos copias a mano.
 *
 * Los colores salen de los tokens de la app (asistente.module.css), así que
 * siguen al tema. `colorMio` se conserva en la firma por la pantalla completa,
 * pero ya no se usa: el color de «mis» mensajes es --primary.
 */

import { Camera, Paperclip } from 'lucide-react';
import type { TicketMessage } from '@/lib/hooks/useTicketChat';
import s from './asistente/asistente.module.css';

function formatearHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({
  message: m,
  mine,
  leido,
  loading,
  onCapture,
  onAttach,
  onImageClick,
  onImageLoad,
  capturaTitle,
  adjuntoTitle,
}: {
  message: TicketMessage;
  mine: boolean;
  leido: boolean;
  colorMio?: string;
  loading: boolean;
  onCapture: () => void;
  onAttach: () => void;
  onImageClick: (url: string) => void;
  onImageLoad?: () => void;
  capturaTitle: string;
  adjuntoTitle: string;
}) {
  if (m.senderType === 'system') {
    return (
      <div className={s.sSistema}>
        <span>{m.content}</span>
      </div>
    );
  }

  const isScreenshotRequest = m.messageType === 'screenshot_request';
  const attachmentUrl = m.attachment ? `/api/zero-tickets/attachments/${m.attachment.id}` : null;

  return (
    <div className={`${s.sBurbuja} ${mine ? s.sMia : s.sSuya}`}>
      {!mine && <span className={s.sAutor}>Soporte</span>}
      <div className={`${s.sTexto} ${mine ? s.sTextoMio : s.sTextoSuyo}`}>
        {isScreenshotRequest && (
          <div className={s.sPedido}>
            <Camera size={13} aria-hidden /> Pidieron una captura
          </div>
        )}
        {m.content}
        {isScreenshotRequest && !mine && (
          <div className={s.sAcciones}>
            <button type="button" className={s.sAccion} onClick={onCapture} disabled={loading} title={capturaTitle}>
              <Camera size={13} aria-hidden /> Capturar pantalla
            </button>
            <button type="button" className={s.sAccion} onClick={onAttach} title={adjuntoTitle}>
              <Paperclip size={13} aria-hidden /> Adjuntar captura
            </button>
          </div>
        )}
        {m.attachment && attachmentUrl && (
          <div className={s.sAdjunto} style={{ marginTop: m.content ? 8 : 0 }}>
            {m.attachment.kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentUrl}
                alt={m.attachment.fileName}
                onClick={() => onImageClick(attachmentUrl)}
                onLoad={onImageLoad}
              />
            )}
            {m.attachment.kind === 'video' && <video src={attachmentUrl} controls />}
            {m.attachment.kind === 'file' && (
              <a className={s.sArchivo} href={attachmentUrl} target="_blank" rel="noreferrer">
                <Paperclip size={13} aria-hidden /> {m.attachment.fileName}
              </a>
            )}
          </div>
        )}
      </div>
      <div className={s.sHora}>
        {formatearHora(m.createdAt)}
        {mine && <span className={leido ? s.sLeido : undefined}>{leido ? '✓✓' : '✓'}</span>}
      </div>
    </div>
  );
}
