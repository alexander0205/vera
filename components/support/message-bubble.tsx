'use client';

/**
 * Una burbuja del chat de soporte — compartida entre el widget flotante y
 * /dashboard/soporte para que no diverjan en dos copias a mano.
 */

import { Camera, Paperclip } from 'lucide-react';
import type { TicketMessage } from '@/lib/hooks/useTicketChat';

function formatearHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({
  message: m,
  mine,
  leido,
  colorMio,
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
  colorMio: string;
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
      <div style={{ alignSelf: 'center', margin: '4px 0' }}>
        <span style={{
          fontSize: 11.5, color: '#64748b', background: '#f1f5f9',
          borderRadius: 999, padding: '4px 12px', display: 'inline-block',
        }}>
          {m.content}
        </span>
      </div>
    );
  }

  const isScreenshotRequest = m.messageType === 'screenshot_request';
  const attachmentUrl = m.attachment ? `/api/zero-tickets/attachments/${m.attachment.id}` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
      {!mine && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 3, marginLeft: 2 }}>
          Soporte
        </span>
      )}
      <div
        style={{
          background: mine ? colorMio : 'white',
          color: mine ? 'white' : '#1e293b',
          border: mine ? 'none' : '1px solid #e5e7eb',
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          padding: '9px 13px',
          fontSize: 14.5,
          lineHeight: 1.45,
          boxShadow: mine ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.05)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {isScreenshotRequest && (
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Camera size={13} /> Pidieron una captura
          </div>
        )}
        {m.content}
        {isScreenshotRequest && !mine && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={onCapture}
              disabled={loading}
              title={capturaTitle}
              style={{
                background: '#f8fafc', color: colorMio, border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '6px 11px', fontSize: 12, cursor: loading ? 'default' : 'pointer', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Camera size={13} /> Capturar pantalla
            </button>
            <button
              onClick={onAttach}
              title={adjuntoTitle}
              style={{
                background: '#f8fafc', color: colorMio, border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '6px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Paperclip size={13} /> Adjuntar captura
            </button>
          </div>
        )}
        {m.attachment && attachmentUrl && (
          <div style={{ marginTop: m.content ? 8 : 0 }}>
            {m.attachment.kind === 'image' && (
              <img
                src={attachmentUrl}
                alt={m.attachment.fileName}
                onClick={() => onImageClick(attachmentUrl)}
                onLoad={onImageLoad}
                style={{ maxWidth: '100%', borderRadius: 10, cursor: 'zoom-in', display: 'block' }}
              />
            )}
            {m.attachment.kind === 'video' && (
              <video src={attachmentUrl} controls style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
            )}
            {m.attachment.kind === 'file' && (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: mine ? 'white' : colorMio, textDecoration: 'none', fontSize: 12.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: mine ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                  border: mine ? 'none' : '1px solid #e2e8f0',
                  borderRadius: 8, padding: '5px 10px',
                }}
              >
                <Paperclip size={13} /> {m.attachment.fileName}
              </a>
            )}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 10.5, color: '#94a3b8', marginTop: 3,
        marginLeft: mine ? 0 : 2, marginRight: mine ? 2 : 0,
        alignSelf: mine ? 'flex-end' : 'flex-start',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {formatearHora(m.createdAt)}
        {mine && <span style={{ color: leido ? colorMio : '#cbd5e1' }}>{leido ? '✓✓' : '✓'}</span>}
      </div>
    </div>
  );
}
