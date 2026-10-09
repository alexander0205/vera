'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, PhoneCall } from 'lucide-react';
import { ImageLightbox } from '@/components/support/image-lightbox';
import { PanelLlamada } from '@/components/support/panel-llamada';
import { LlamadaFinalizada } from '@/components/support/llamada-finalizada';
import { PulsoLlamada } from '@/components/support/pulso-llamada';
import { useLlamada } from '@/lib/webrtc/useLlamada';
import { useLlamadaFinalizadaReciente } from '@/lib/webrtc/useLlamadaFinalizadaReciente';
import { iniciarLlamada, type LlamadaDTO } from '@/lib/webrtc/senalizacion';

interface TicketRow {
  id: number;
  status: string;
  onHold: boolean;
  createdAt: string;
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

interface CannedResponse {
  id: number;
  label: string;
  category: string;
  content: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

const CANNED_CATEGORIES = ['saludo', 'espera', 'cierre', 'general'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  saludo: 'Saludo',
  espera: 'Espera',
  cierre: 'Cierre',
  general: 'General',
};

/**
 * Imagen de un mensaje: mientras carga muestra un placeholder animado en vez
 * de un hueco en blanco — la carga es lenta acá (sin S3 configurado en este
 * entorno, los adjuntos vienen de Postgres en base64), así que sin esto la
 * lista de mensajes se veía "rota" varios segundos antes de que la imagen
 * apareciera. Un click abre el lightbox a pantalla completa.
 */
function AdjuntoImagen({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const [cargada, setCargada] = useState(false);
  return (
    <div className="relative max-w-full rounded overflow-hidden" style={{ minHeight: cargada ? undefined : 80, minWidth: cargada ? undefined : 120 }}>
      {!cargada && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setCargada(true)}
        onClick={onClick}
        className="max-w-full rounded cursor-zoom-in transition-opacity"
        style={{ opacity: cargada ? 1 : 0 }}
      />
    </div>
  );
}

export default function ZeroTicketsPage() {
  const [ticketList, setTicketList] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [call, setCall] = useState<LlamadaDTO | null>(null);
  // Optimista: se pone en `true` en el mismo click, ANTES de esperar la
  // respuesta del POST — sin esto, entre el click y que el poll trae
  // `call.status === 'pendiente'` (red + hasta 1.5s de poll) el botón
  // seguía diciendo "Llamar" sin ningún cambio visible, así que el agente
  // dudaba si el click pegó y clickeaba de nuevo — el segundo POST chocaba
  // contra la llamada que ya se estaba creando (409) y salía un
  // `window.alert`. Se descarta apenas `call` (la fuente de verdad real)
  // confirma el nuevo estado.
  const [llamando, setLlamando] = useState(false);
  const [errorLlamada, setErrorLlamada] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const llamada = useLlamada('agent', call);
  const finalizadaReciente = useLlamadaFinalizadaReciente(call);
  // El video arranca grande a propósito: en una llamada de soporte lo que hay
  // que mirar es la pantalla del cliente, no el chat. En 420 px un escritorio
  // de 1920 entra a menos de una cuarta parte y el texto no se lee.
  const [videoAncho, setVideoAncho] = useState(true);
  // Derivado en el render, no en un efecto: es una función de lo que ya hay.
  const videoLlenandoElArea = videoAncho && (call?.status === 'activa' || Boolean(finalizadaReciente));
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState(false);
  const [onlineAgents, setOnlineAgents] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Sin esto, si un tick tarda más que el intervalo (DB lenta) el siguiente
  // dispara igual — los requests se amontonan sin límite (uno nuevo cada
  // 1.5s aunque ninguno haya vuelto todavía) y la cola crece para siempre en
  // vez de estabilizarse. Mismo patrón que pollInFlightRef en useTicketChat.
  const messagesInFlightRef = useRef(false);
  const ticketsInFlightRef = useRef(false);
  const presenceInFlightRef = useRef(false);

  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);

  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [showCannedDropdown, setShowCannedDropdown] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formCategory, setFormCategory] = useState<string>('general');
  const [formContent, setFormContent] = useState('');
  const [savingCanned, setSavingCanned] = useState(false);

  async function loadTickets() {
    if (ticketsInFlightRef.current) return;
    ticketsInFlightRef.current = true;
    try {
      const res = await fetch('/api/zero-tickets/agent/tickets');
      if (res.ok) setTicketList((await res.json()).tickets);
    } finally {
      ticketsInFlightRef.current = false;
    }
  }

  async function loadMessages(id: number) {
    if (messagesInFlightRef.current) return;
    messagesInFlightRef.current = true;
    try {
      const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setCall(data.call ?? null);
      }
    } finally {
      messagesInFlightRef.current = false;
    }
  }

  async function loadPresence() {
    if (presenceInFlightRef.current) return;
    presenceInFlightRef.current = true;
    try {
      const res = await fetch('/api/zero-tickets/agent/presence');
      if (res.ok) {
        const data = await res.json();
        setAvailable(data.available);
        setOnlineAgents(data.onlineAgents);
      }
    } finally {
      presenceInFlightRef.current = false;
    }
  }

  async function loadCannedResponses() {
    const res = await fetch('/api/zero-tickets/agent/canned-responses');
    if (res.ok) setCannedResponses((await res.json()).cannedResponses);
  }

  async function loadMe() {
    const res = await fetch('/api/user');
    if (res.ok) setMe(await res.json());
  }

  useEffect(() => {
    loadTickets();
    loadPresence();
    loadCannedResponses();
    loadMe();
    const interval = setInterval(() => {
      loadTickets();
      loadPresence();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!available) return;
    const sendHeartbeat = () => {
      fetch('/api/zero-tickets/agent/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: true }),
      }).catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
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

  // Entrar a un ticket, o que le lleguen mensajes nuevos, tiene que dejar al
  // agente viendo lo último — no el arranque de la conversación. Sin esto se
  // quedaba con el scroll donde React lo montó (arriba del todo).
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [selectedId, messages]);

  // `call` es la fuente de verdad real (viene del poll) — apenas confirma
  // cualquier estado de la llamada, el optimista ya cumplió su función.
  useEffect(() => {
    if (call) setLlamando(false);
  }, [call]);

  useEffect(() => {
    if (!errorLlamada) return;
    const t = setTimeout(() => setErrorLlamada(null), 4000);
    return () => clearTimeout(t);
  }, [errorLlamada]);

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

  async function toggleHold(id: number, currentOnHold: boolean) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onHold: !currentOnHold }),
    });
    if (!res.ok) window.alert('No se pudo actualizar el estado de espera del ticket.');
    await loadTickets();
  }

  async function requestScreenshot(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/request-screenshot`, { method: 'POST' });
    if (!res.ok) window.alert('No se pudo pedir la captura.');
    await loadMessages(id);
  }

  async function startCall(id: number) {
    if (llamando || call?.status === 'pendiente' || call?.status === 'activa') return;
    setLlamando(true);
    setErrorLlamada(null);
    try {
      await iniciarLlamada(id);
      await loadMessages(id);
    } catch (e) {
      // Sin window.alert — se corta el estado optimista y el motivo real
      // queda inline, chico, junto al botón (se desvanece solo).
      setLlamando(false);
      setErrorLlamada(e instanceof Error ? e.message : 'No se pudo iniciar la llamada.');
    }
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

  function aplicarVariables(content: string, ticket: TicketRow, agentName: string): string {
    return content
      .replace(/\{agente\}/g, agentName)
      .replace(/\{cliente\}/g, ticket.userName ?? ticket.userEmail)
      .replace(/\{colegio\}/g, ticket.teamName);
  }

  function insertCannedResponse(cr: CannedResponse) {
    const content = selected
      ? aplicarVariables(cr.content, selected, me?.name ?? me?.email ?? 'Soporte')
      : cr.content;
    setReply((prev) => (prev.trim() ? `${prev}\n${content}` : content));
    setShowCannedDropdown(false);
  }

  function resetCannedForm() {
    setEditingId(null);
    setFormLabel('');
    setFormCategory('general');
    setFormContent('');
  }

  function startEditCanned(cr: CannedResponse) {
    setEditingId(cr.id);
    setFormLabel(cr.label);
    setFormCategory(cr.category);
    setFormContent(cr.content);
  }

  async function saveCannedResponse() {
    const label = formLabel.trim();
    const content = formContent.trim();
    if (!label || !content) return;
    setSavingCanned(true);
    try {
      const url = editingId
        ? `/api/zero-tickets/agent/canned-responses/${editingId}`
        : '/api/zero-tickets/agent/canned-responses';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, category: formCategory, content }),
      });
      if (res.ok) {
        resetCannedForm();
        await loadCannedResponses();
      } else {
        window.alert('No se pudo guardar la respuesta predeterminada.');
      }
    } finally {
      setSavingCanned(false);
    }
  }

  async function deleteCannedResponse(id: number) {
    if (!window.confirm('¿Eliminar esta respuesta predeterminada?')) return;
    const res = await fetch(`/api/zero-tickets/agent/canned-responses/${id}`, { method: 'DELETE' });
    if (!res.ok) window.alert('No se pudo eliminar la respuesta predeterminada.');
    if (editingId === id) resetCannedForm();
    await loadCannedResponses();
  }

  const selected = ticketList.find((t) => t.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {/* Durante una llamada la cola estorba: lo que hay que mirar es la
          pantalla del cliente. Vuelve con el mismo botón que achica el video. */}
      <div className={`w-80 shrink-0 flex-col gap-3 ${videoLlenandoElArea ? 'hidden' : 'flex'}`}>
        <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Mi estado</div>
            <div className="text-xs text-gray-500">{onlineAgents} agente(s) disponible(s)</div>
          </div>
          <button
            onClick={toggleAvailable}
            className={`text-xs px-3 py-1.5 rounded ${available ? 'bg-[#3658e1] text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            {available ? 'Disponible' : 'No disponible'}
          </button>
        </div>

        <div className="flex-1 border rounded-lg bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b font-bold text-gray-900">Tickets ({ticketList.length})</div>
          {(() => {
            const now = Date.now();
            const esperando = ticketList
              .filter((t) => t.status === 'esperando')
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const resto = ticketList.filter((t) => t.status !== 'esperando');
            const sortedList = [...esperando, ...resto];
            return sortedList.map((t) => {
              const isEsperando = t.status === 'esperando';
              const posicion = isEsperando ? esperando.findIndex((e) => e.id === t.id) + 1 : null;
              const minutosEsperando = isEsperando ? (now - new Date(t.createdAt).getTime()) / 60000 : 0;
              const waitBorderClass = !isEsperando
                ? ''
                : minutosEsperando > 15
                ? 'border-l-4 border-red-500'
                : minutosEsperando >= 5
                ? 'border-l-4 border-amber-500'
                : 'border-l-4 border-transparent';
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${waitBorderClass} ${selectedId === t.id ? 'bg-[#eef1fd]' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
                      {t.unread && <span className="w-2 h-2 rounded-full bg-[#3658e1] shrink-0" />}
                      {t.userName ?? t.userEmail}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {t.onHold && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                          ⏸ en espera
                        </span>
                      )}
                      {posicion != null && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            minutosEsperando > 15 ? 'bg-red-100 text-red-700' : minutosEsperando >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          #{posicion} en cola
                        </span>
                      )}
                      <span className={`text-xs ${t.status === 'esperando' ? 'text-amber-600' : t.status === 'abierto' ? 'text-[#3658e1]' : 'text-gray-400'}`}>
                        {t.status}
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{t.teamName}</div>
                  <div className="text-xs text-gray-600 truncate mt-1">
                    {t.userTyping ? <em>escribiendo...</em> : (t.lastMessage ?? '(sin mensajes)')}
                  </div>
                  {t.assignedAgentName && <div className="text-[10px] text-gray-400 mt-1">Agente: {t.assignedAgentName}</div>}
                </button>
              );
            });
          })()}
          {ticketList.length === 0 && <div className="p-4 text-sm text-gray-400">Ningún ticket todavía.</div>}
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-w-0">
      <div className={`border rounded-lg bg-white flex flex-col min-w-0 ${videoLlenandoElArea ? 'w-[380px] shrink-0' : 'flex-1'}`}>
        {selectedId == null || !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecciona un ticket</div>
        ) : (
          <>
            {/* Con el video ocupando el área, la columna del chat queda en
                380 px y los cuatro botones no entran en la misma línea que el
                nombre: ahí se apilan. */}
            <div className={`px-4 py-3 border-b flex gap-2 ${videoLlenandoElArea ? 'flex-col items-start' : 'justify-between items-center'}`}>
              <div className="min-w-0">
                <div className="font-bold text-gray-900 truncate">{selected.userName ?? selected.userEmail}</div>
                <div className="text-xs text-gray-500 truncate">{selected.teamName}</div>
              </div>
              <div className="flex gap-2 flex-wrap shrink-0">
                {!selected.assignedAgentId && (
                  <button onClick={() => claim(selected.id)} className="text-xs px-3 py-1.5 rounded bg-[#3658e1] text-white hover:bg-[#2c46b4]">
                    Tomar ticket
                  </button>
                )}
                <button onClick={() => requestScreenshot(selected.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Pedir captura
                </button>
                <button
                  onClick={() => startCall(selected.id)}
                  disabled={llamando || call?.status === 'pendiente' || call?.status === 'activa'}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {llamando || call?.status === 'pendiente' ? (
                    <PulsoLlamada icono={PhoneCall} diametro={16} iconoTamano={10} />
                  ) : call?.status === 'activa' ? (
                    <PhoneOff size={14} />
                  ) : (
                    <Phone size={14} />
                  )}
                  {llamando || call?.status === 'pendiente' ? 'Llamando…' : call?.status === 'activa' ? 'En llamada' : 'Llamar'}
                </button>
                {errorLlamada && (
                  <span className="text-xs text-red-600 self-center">{errorLlamada}</span>
                )}
                <button
                  onClick={() => toggleHold(selected.id, selected.onHold)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    selected.onHold ? 'border-sky-600 text-sky-700 hover:bg-sky-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {selected.onHold ? 'Quitar espera' : 'En espera'}
                </button>
                <button
                  onClick={() => toggleStatus(selected.id, selected.status)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    selected.status === 'cerrado' ? 'border-[#3658e1] text-[#3658e1] hover:bg-[#eef1fd]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {selected.status === 'cerrado' ? 'Reabrir' : 'Cerrar'}
                </button>
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => {
                if (m.senderType === 'system') {
                  return (
                    <div key={m.id} className="text-center text-[11px] text-gray-400">{m.content}</div>
                  );
                }
                const mine = m.senderType === 'agent';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`inline-block max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-[#3658e1] text-white' : 'bg-gray-100 text-gray-900'}`}>
                      {m.messageType === 'screenshot_request' && (
                        <div className="text-[11px] opacity-80 mb-1">📸 Pedido de captura</div>
                      )}
                      {m.content}
                      {m.attachment && (
                        <div className="mt-1.5">
                          {m.attachment.kind === 'image' && (
                            <AdjuntoImagen
                              src={`/api/zero-tickets/attachments/${m.attachment.id}`}
                              alt={m.attachment.fileName}
                              onClick={() => setLightbox(`/api/zero-tickets/attachments/${m.attachment!.id}`)}
                            />
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

            <div className="border-t p-3">
              <div className="flex items-center gap-2 mb-2 relative">
                <button
                  onClick={() => setShowCannedDropdown((v) => !v)}
                  className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Respuestas ▾
                </button>
                <button
                  onClick={() => {
                    resetCannedForm();
                    setShowManageModal(true);
                    setShowCannedDropdown(false);
                  }}
                  className="text-xs px-2.5 py-1 rounded text-gray-500 hover:underline"
                >
                  Gestionar
                </button>
                {showCannedDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 w-80 max-h-72 overflow-y-auto border rounded-lg bg-white shadow-lg z-10">
                    {cannedResponses.length === 0 && (
                      <div className="p-3 text-xs text-gray-400">Ninguna respuesta predeterminada todavía.</div>
                    )}
                    {cannedResponses.map((cr) => (
                      <button
                        key={cr.id}
                        onClick={() => insertCannedResponse(cr)}
                        className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#dde3fa] text-[#3658e1]">
                            {CATEGORY_LABELS[cr.category] ?? cr.category}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{cr.label}</span>
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{cr.content}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => onReplyChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="Escribe una respuesta..."
                  className="flex-1 border rounded px-3 py-2 text-sm"
                />
                <button onClick={sendReply} disabled={sending} className="bg-[#3658e1] text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                  Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {finalizadaReciente ? (
        <div
          style={videoLlenandoElArea ? undefined : { width: 420 }}
          className={videoLlenandoElArea ? 'flex-1 min-w-0' : 'shrink-0'}
        >
          <LlamadaFinalizada />
        </div>
      ) : null}
      {call?.status === 'activa' ? (
        <div
          style={videoLlenandoElArea ? undefined : { width: 420 }}
          className={videoLlenandoElArea ? 'flex-1 min-w-0' : 'shrink-0'}
        >
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
            ancho={videoAncho}
            onAlternarAncho={() => setVideoAncho((v) => !v)}
          />
        </div>
      ) : null}
      </div>

      {showManageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div className="font-bold text-gray-900">Respuestas predeterminadas</div>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  resetCannedForm();
                }}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cannedResponses.length === 0 && (
                <div className="text-sm text-gray-400">Ninguna respuesta predeterminada todavía.</div>
              )}
              {cannedResponses.map((cr) => (
                <div key={cr.id} className="border rounded-lg p-3 flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#dde3fa] text-[#3658e1]">
                        {CATEGORY_LABELS[cr.category] ?? cr.category}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{cr.label}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{cr.content}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEditCanned(cr)} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                      Editar
                    </button>
                    <button onClick={() => deleteCannedResponse(cr.id)} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-4 space-y-2">
              <div className="text-sm font-medium text-gray-900">{editingId ? 'Editar respuesta' : 'Nueva respuesta'}</div>
              <div className="flex gap-2">
                <input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Etiqueta (ej. Saludo inicial)"
                  className="flex-1 border rounded px-3 py-2 text-sm"
                />
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="border rounded px-2 py-2 text-sm"
                >
                  {CANNED_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Contenido de la respuesta..."
                rows={3}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <div className="text-[10px] text-gray-400">
                Variables disponibles: {'{agente}'} · {'{cliente}'} · {'{colegio}'}
              </div>
              <div className="flex justify-end gap-2">
                {editingId && (
                  <button onClick={resetCannedForm} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Cancelar edición
                  </button>
                )}
                <button
                  onClick={saveCannedResponse}
                  disabled={savingCanned || !formLabel.trim() || !formContent.trim()}
                  className="text-xs px-3 py-1.5 rounded bg-[#3658e1] text-white hover:bg-[#2c46b4] disabled:opacity-50"
                >
                  {editingId ? 'Guardar cambios' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
