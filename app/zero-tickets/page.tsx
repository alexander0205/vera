'use client';

import { useEffect, useRef, useState } from 'react';

interface TicketRow {
  id: number;
  status: string;
  lastMessageAt: string;
  unread: boolean;
  userTyping: boolean;
  teamId: number;
  teamName: string;
  userName: string | null;
  userEmail: string;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  lastMessage: string | null;
}

interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
}

interface Message {
  id: number;
  senderType: 'user' | 'agent' | 'system';
  messageType: 'text' | 'screenshot_request';
  content: string | null;
  createdAt: string;
  attachment: Attachment | null;
}

export default function ZeroTicketsPage() {
  const [ticketList, setTicketList] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState(false);
  const [onlineAgents, setOnlineAgents] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);

  async function loadTickets() {
    const res = await fetch('/api/zero-tickets/agent/tickets');
    if (res.ok) setTicketList((await res.json()).tickets);
  }

  async function loadMessages(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/messages`);
    if (res.ok) setMessages((await res.json()).messages);
  }

  async function loadPresence() {
    const res = await fetch('/api/zero-tickets/agent/presence');
    if (res.ok) {
      const data = await res.json();
      setAvailable(data.available);
      setOnlineAgents(data.onlineAgents);
    }
  }

  useEffect(() => {
    loadTickets();
    loadPresence();
    const interval = setInterval(() => {
      loadTickets();
      loadPresence();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!available) return;
    const heartbeat = setInterval(() => {
      fetch('/api/zero-tickets/agent/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: true }),
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(heartbeat);
  }, [available]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedId == null) return;
    loadMessages(selectedId);
    pollRef.current = setInterval(() => loadMessages(selectedId), 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId]);

  async function toggleAvailable() {
    const next = !available;
    setAvailable(next);
    try {
      await fetch('/api/zero-tickets/agent/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: next }),
      });
    } finally {
      await loadPresence();
    }
  }

  async function claim(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/claim`, { method: 'POST' });
    if (res.status === 409) {
      window.alert('Este ticket ya fue tomado por otro agente.');
    } else if (!res.ok) {
      window.alert('No se pudo tomar el ticket. Intentá de nuevo.');
    }
    await loadTickets();
  }

  async function toggleStatus(id: number, currentStatus: string) {
    const nextStatus = currentStatus === 'cerrado' ? 'abierto' : 'cerrado';
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) window.alert('No se pudo actualizar el estado del ticket.');
    await loadTickets();
  }

  async function requestScreenshot(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/request-screenshot`, { method: 'POST' });
    if (!res.ok) window.alert('No se pudo pedir la captura.');
    await loadMessages(id);
  }

  function onReplyChange(value: string) {
    setReply(value);
    if (!selectedId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      fetch(`/api/zero-tickets/agent/tickets/${selectedId}/typing`, { method: 'POST' }).catch(() => {});
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/zero-tickets/agent/tickets/${selectedId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (res.ok) {
        setReply('');
        await loadMessages(selectedId);
        await loadTickets();
      }
    } finally {
      setSending(false);
    }
  }

  const selected = ticketList.find((t) => t.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      <div className="w-80 shrink-0 flex flex-col gap-3">
        <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Mi estado</div>
            <div className="text-xs text-gray-500">{onlineAgents} agente(s) disponible(s)</div>
          </div>
          <button
            onClick={toggleAvailable}
            className={`text-xs px-3 py-1.5 rounded ${available ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            {available ? 'Disponible' : 'No disponible'}
          </button>
        </div>

        <div className="flex-1 border rounded-lg bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b font-bold text-gray-900">Tickets ({ticketList.length})</div>
          {ticketList.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${selectedId === t.id ? 'bg-teal-50' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
                  {t.unread && <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />}
                  {t.userName ?? t.userEmail}
                </span>
                <span className={`text-xs ${t.status === 'esperando' ? 'text-amber-600' : t.status === 'abierto' ? 'text-teal-600' : 'text-gray-400'}`}>
                  {t.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">{t.teamName}</div>
              <div className="text-xs text-gray-600 truncate mt-1">
                {t.userTyping ? <em>escribiendo...</em> : (t.lastMessage ?? '(sin mensajes)')}
              </div>
              {t.assignedAgentName && <div className="text-[10px] text-gray-400 mt-1">Agente: {t.assignedAgentName}</div>}
            </button>
          ))}
          {ticketList.length === 0 && <div className="p-4 text-sm text-gray-400">Ningún ticket todavía.</div>}
        </div>
      </div>

      <div className="flex-1 border rounded-lg bg-white flex flex-col">
        {selectedId == null || !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecciona un ticket</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <div className="font-bold text-gray-900">{selected.userName ?? selected.userEmail}</div>
                <div className="text-xs text-gray-500">{selected.teamName}</div>
              </div>
              <div className="flex gap-2">
                {!selected.assignedAgentId && (
                  <button onClick={() => claim(selected.id)} className="text-xs px-3 py-1.5 rounded bg-teal-600 text-white hover:bg-teal-700">
                    Tomar ticket
                  </button>
                )}
                <button onClick={() => requestScreenshot(selected.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Pedir captura
                </button>
                <button
                  onClick={() => toggleStatus(selected.id, selected.status)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    selected.status === 'cerrado' ? 'border-teal-600 text-teal-700 hover:bg-teal-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {selected.status === 'cerrado' ? 'Reabrir' : 'Cerrar'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => {
                if (m.senderType === 'system') {
                  return (
                    <div key={m.id} className="text-center text-[11px] text-gray-400">{m.content}</div>
                  );
                }
                const mine = m.senderType === 'agent';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`inline-block max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                      {m.messageType === 'screenshot_request' && (
                        <div className="text-[11px] opacity-80 mb-1">📸 Pedido de captura</div>
                      )}
                      {m.content}
                      {m.attachment && (
                        <div className="mt-1.5">
                          {m.attachment.kind === 'image' && (
                            <img src={`/api/zero-tickets/attachments/${m.attachment.id}`} alt={m.attachment.fileName} className="max-w-full rounded" />
                          )}
                          {m.attachment.kind === 'video' && (
                            <video src={`/api/zero-tickets/attachments/${m.attachment.id}`} controls className="max-w-full rounded" />
                          )}
                          {m.attachment.kind === 'file' && (
                            <a href={`/api/zero-tickets/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer" className="underline text-xs">
                              📎 {m.attachment.fileName}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t p-3 flex gap-2">
              <input
                value={reply}
                onChange={(e) => onReplyChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                placeholder="Escribe una respuesta..."
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <button onClick={sendReply} disabled={sending} className="bg-teal-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
