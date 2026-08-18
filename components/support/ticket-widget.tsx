'use client';

/**
 * Widget flotante de Zero Tickets. Polling cada 1.5s mientras está abierto
 * (elegido en vez de WebSockets para v1 — ver docs/superpowers/plans/
 * 2026-08-14-zero-tickets.md). Historial vive en la DB, se recupera al montar.
 */

import { useEffect, useRef, useState } from 'react';

interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
}

interface TicketMessage {
  id: number;
  senderType: 'user' | 'agent' | 'system';
  messageType: 'text' | 'screenshot_request';
  content: string | null;
  createdAt: string;
  attachment: Attachment | null;
}

interface Espera {
  agentesDisponibles: number;
  enCola: number;
  esperaMinutos: number | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export function TicketWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [onHold, setOnHold] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [readByAgentAt, setReadByAgentAt] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const ticketIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevStatusRef = useRef<string | null>(null);
  const [canCapture, setCanCapture] = useState(false);

  async function poll() {
    const res = await fetch('/api/zero-tickets/tickets');
    if (!res.ok) return;
    const data = await res.json();
    if (data.ticket) {
      ticketIdRef.current = data.ticket.id;
      setMessages(data.messages);
      setStatus(data.ticket.status);
      setOnHold(Boolean(data.ticket.onHold));
      setAgentTyping(Boolean(data.ticket.agentTyping));
      setReadByAgentAt(data.ticket.lastReadByAgentAt);
    }
    setEspera(data.espera);
  }

  useEffect(() => {
    poll();
  }, []);

  useEffect(() => {
    setCanCapture(
      typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  useEffect(() => {
    const justClosed = status === 'cerrado' && prevStatusRef.current !== 'cerrado';
    prevStatusRef.current = status;
    if (!justClosed) return;

    fetch('/api/zero-tickets/tickets/rating')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.canRate) setShowRating(true);
      })
      .catch(() => {});
  }, [status]);

  async function submitRating() {
    if (ratingValue < 1 || ratingLoading) return;
    setRatingLoading(true);
    try {
      const res = await fetch('/api/zero-tickets/tickets/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment.trim() || undefined }),
      });
      if (res.ok) {
        setShowRating(false);
        setRatingSubmitted(true);
      }
    } finally {
      setRatingLoading(false);
    }
  }

  function onInputChange(value: string) {
    setInput(value);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      fetch('/api/zero-tickets/tickets/typing', { method: 'POST' }).catch(() => {});
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/zero-tickets/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) await poll();
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/zero-tickets/tickets/attachments', { method: 'POST', body: form });
      if (res.ok) await poll();
    } finally {
      setLoading(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadFile(file);
  }

  async function captureScreenshot() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      window.alert('Tu navegador no soporta captura de pantalla. Usá el botón de adjuntar archivo.');
      return;
    }
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;

    // Corta el stream Y suelta la referencia del <video> — algunos navegadores
    // (Firefox sobre todo) no apagan el indicador de "compartiendo pantalla"
    // hasta que ningún elemento sigue apuntando al stream via srcObject, no
    // alcanza con solo llamar track.stop().
    function stopSharing() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    }

    setLoading(true);
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

      video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          if (!video) return reject(new Error('no video element'));
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('video load error'));
          video.play().catch(reject);
        }),
        8000,
      );

      // Asegura que haya al menos un frame pintado antes de capturar.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Corta la sesión de screen-share apenas tenemos el frame — antes de
      // subir el archivo, no después.
      stopSharing();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('no blob');

      const file = new File([blob], 'captura.png', { type: 'image/png' });
      await uploadFile(file);
    } catch {
      // El usuario canceló el picker nativo o denegó el permiso, o se agotó el tiempo de espera — no alertamos.
    } finally {
      stopSharing();
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%', background: '#7c3aed',
          color: 'white', border: 'none', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        💬
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        width: 340, height: 500, background: 'white', border: '1px solid #ddd',
        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ background: '#7c3aed', color: 'white', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Soporte</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
      </div>

      {status === 'esperando' && espera && (
        <div style={{ padding: '8px 10px', fontSize: 12, background: '#eef2ff', color: '#3730a3', textAlign: 'center' }}>
          {espera.agentesDisponibles === 0
            ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
            : `Tiempo de espera estimado: ${espera.esperaMinutos} min (posición en cola: ${espera.enCola})`}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => {
          const key = m.id != null ? `msg-${m.id}` : `tmp-${i}`;
          if (m.senderType === 'system') {
            return (
              <div key={key} style={{ alignSelf: 'center', fontSize: 11, color: '#888', textAlign: 'center' }}>
                {m.content}
              </div>
            );
          }
          const mine = m.senderType === 'user';
          const leido = mine && readByAgentAt != null && new Date(m.createdAt) <= new Date(readByAgentAt);
          const isScreenshotRequest = m.messageType === 'screenshot_request';
          return (
            <div
              key={key}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                background: mine ? '#7c3aed' : '#0f766e',
                color: 'white',
                padding: '6px 10px', borderRadius: 12, maxWidth: '80%', fontSize: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {isScreenshotRequest && (
                <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>📸 Pidieron una captura</div>
              )}
              {m.content}
              {isScreenshotRequest && !mine && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canCapture && (
                    <button
                      onClick={captureScreenshot}
                      disabled={loading}
                      style={{
                        background: 'white', color: '#0f766e', border: 'none', borderRadius: 6,
                        padding: '6px 10px', fontSize: 12, cursor: loading ? 'default' : 'pointer', fontWeight: 600,
                      }}
                    >
                      📸 Capturar pantalla
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'white', color: '#0f766e', border: 'none', borderRadius: 6,
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    📎 Adjuntar captura
                  </button>
                </div>
              )}
              {m.attachment && (
                <div style={{ marginTop: 6 }}>
                  {m.attachment.kind === 'image' && (
                    <img src={`/api/zero-tickets/attachments/${m.attachment.id}`} alt={m.attachment.fileName} style={{ maxWidth: '100%', borderRadius: 6 }} />
                  )}
                  {m.attachment.kind === 'video' && (
                    <video src={`/api/zero-tickets/attachments/${m.attachment.id}`} controls style={{ maxWidth: '100%', borderRadius: 6 }} />
                  )}
                  {m.attachment.kind === 'file' && (
                    <a href={`/api/zero-tickets/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer" style={{ color: 'white', textDecoration: 'underline', fontSize: 12 }}>
                      📎 {m.attachment.fileName}
                    </a>
                  )}
                </div>
              )}
              {mine && (
                <div style={{ fontSize: 10, textAlign: 'right', marginTop: 2, opacity: 0.8 }}>
                  {leido ? '✓✓' : '✓'}
                </div>
              )}
            </div>
          );
        })}
        {agentTyping && <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>El agente está escribiendo...</div>}
        {loading && <div style={{ fontSize: 12, color: '#888' }}>enviando...</div>}
      </div>

      {status === 'cerrado' && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#92400e', background: '#fef3c7', textAlign: 'center' }}>
          Este ticket fue cerrado. Escribe para reabrirlo.
        </div>
      )}

      {showRating && (
        <div style={{ padding: 10, background: '#f5f3ff', borderTop: '1px solid #ddd6fe', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#5b21b6', fontWeight: 600 }}>¿Cómo calificás la atención recibida?</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRatingValue(n)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, color: n <= ratingValue ? '#f59e0b' : '#d1d5db' }}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="Comentario (opcional)"
            rows={2}
            style={{ resize: 'none', border: '1px solid #ddd6fe', borderRadius: 6, padding: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={submitRating}
            disabled={ratingValue < 1 || ratingLoading}
            style={{
              border: 'none', background: ratingValue < 1 || ratingLoading ? '#c4b5fd' : '#7c3aed', color: 'white',
              borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: ratingValue < 1 || ratingLoading ? 'default' : 'pointer',
            }}
          >
            {ratingLoading ? 'Enviando...' : 'Enviar calificación'}
          </button>
        </div>
      )}

      {ratingSubmitted && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#166534', background: '#dcfce7', textAlign: 'center' }}>
          ¡Gracias por tu calificación!
        </div>
      )}

      {status === 'abierto' && onHold && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#334155', background: '#f1f5f9', textAlign: 'center' }}>
          Tu ticket está en espera mientras el agente investiga.
        </div>
      )}

      <div style={{ display: 'flex', borderTop: '1px solid #eee', alignItems: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={onFileSelected} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Adjuntar archivo"
          style={{ border: 'none', background: 'none', fontSize: 18, padding: '0 8px', cursor: 'pointer' }}
        >
          📎
        </button>
        {canCapture && (
          <button
            onClick={captureScreenshot}
            title="Capturar pantalla"
            disabled={loading}
            style={{ border: 'none', background: 'none', fontSize: 18, padding: '0 8px', cursor: loading ? 'default' : 'pointer' }}
          >
            📸
          </button>
        )}
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje..."
          style={{ flex: 1, border: 'none', padding: 10, fontSize: 14, outline: 'none' }}
        />
        <button onClick={send} style={{ border: 'none', background: '#7c3aed', color: 'white', padding: '0 16px', height: '100%', cursor: 'pointer' }}>
          Enviar
        </button>
      </div>
    </div>
  );
}
