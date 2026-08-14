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

export function TicketWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [readByAgentAt, setReadByAgentAt] = useState<string | null>(null);
  const ticketIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function poll() {
    const res = await fetch('/api/zero-tickets/tickets');
    if (!res.ok) return;
    const data = await res.json();
    if (data.ticket) {
      ticketIdRef.current = data.ticket.id;
      setMessages(data.messages);
      setStatus(data.ticket.status);
      setAgentTyping(Boolean(data.ticket.agentTyping));
      setReadByAgentAt(data.ticket.lastReadByAgentAt);
    }
    setEspera(data.espera);
  }

  useEffect(() => {
    poll();
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

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

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
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
                <div style={{ marginTop: 6 }}>
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

      <div style={{ display: 'flex', borderTop: '1px solid #eee', alignItems: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={onFileSelected} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Adjuntar archivo"
          style={{ border: 'none', background: 'none', fontSize: 18, padding: '0 8px', cursor: 'pointer' }}
        >
          📎
        </button>
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
