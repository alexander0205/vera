'use client';

/**
 * Toda la lógica de Zero Tickets del lado cliente, compartida entre el
 * widget flotante y la ruta de pantalla completa (/soporte) — esta última
 * existe para tener espacio real donde meter la videollamada más adelante,
 * cosa que 340x500px de widget flotante no permite.
 *
 * Polling cada 1.5s mientras hay alguien mirando (elegido en vez de
 * WebSockets para v1 — ver docs/superpowers/plans/2026-08-14-zero-tickets.md).
 * Historial vive en la DB, se recupera al montar.
 */

import { useEffect, useRef, useState } from 'react';
import { domToBlob } from 'modern-screenshot';
import type { LlamadaDTO } from '@/lib/webrtc/senalizacion';

export interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
}

export interface TicketMessage {
  id: number;
  senderType: 'user' | 'agent' | 'system';
  messageType: 'text' | 'screenshot_request';
  content: string | null;
  createdAt: string;
  attachment: Attachment | null;
}

export interface Espera {
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

let tempIdCounter = 0;

export function useTicketChat(active: boolean) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  // Mensajes propios que ya se mandaron (POST resuelto) pero que el próximo
  // poll todavía no trajo de vuelta. Sin esto, con la DB lenta el usuario
  // manda un mensaje y lo ve recién cuando el poll siguiente —que puede
  // tardar decenas de segundos— responde. Se descartan solos: en cuanto un
  // poll trae mensajes reales, esos YA están ahí y el optimista sobra.
  const [pending, setPending] = useState<TicketMessage[]>([]);
  const [input, setInput] = useState('');
  // Reemplaza el `loading` booleano genérico: capturar pantalla y subir el
  // archivo son pasos bien distintos y tardan segundos cada uno con la DB
  // lenta — un simple "enviando..." no le decía al usuario en cuál de los
  // dos estaba parado.
  const [busyStage, setBusyStage] = useState<'enviando' | 'capturando' | 'subiendo' | null>(null);
  const loading = busyStage !== null;
  const [status, setStatus] = useState<string | null>(null);
  const [onHold, setOnHold] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [call, setCall] = useState<LlamadaDTO | null>(null);
  const [readByAgentAt, setReadByAgentAt] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const ticketIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);

  async function poll() {
    // Con la DB lenta (Neon remoto, ver conversación en el chat de soporte),
    // una query puede tardar más que el intervalo de 1.5s. Sin esta guarda,
    // el siguiente tick dispara igual, los requests se amontonan y agotan el
    // pool de conexiones (`max: 10` en lib/db/drizzle.ts) — 7s de red
    // terminaban sintiéndose como 30s. Un poll a la vez, nomás.
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    // Con la DB tan lenta un poll colgado podía bloquear el loop entero
    // indefinidamente (nunca se soltaba pollInFlightRef). Cortarlo a los 20s
    // deja que el siguiente tick reintente en vez de trabarse para siempre.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const res = await fetch('/api/zero-tickets/tickets', { signal: abort.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ticket) {
        ticketIdRef.current = data.ticket.id;
        setMessages(data.messages);
        // Un poll puede haber arrancado ANTES de que el POST del mensaje
        // terminara de guardarse — si eso pasa, esta respuesta todavía no lo
        // trae. Vaciar `pending` a ciegas acá lo hacía desaparecer de
        // pantalla hasta que el próximo poll (el que sí lo trae) contestara:
        // "aparece, desaparece, vuelve a aparecer". Ahora solo se saca un
        // pendiente cuando su gemelo real YA está en esta respuesta.
        setPending((prev) => prev.filter((p) =>
          !data.messages.some((m: TicketMessage) =>
            m.senderType === 'user'
            && m.content === p.content
            && Math.abs(new Date(m.createdAt).getTime() - new Date(p.createdAt).getTime()) < 30000,
          ),
        ));
        setStatus(data.ticket.status);
        setOnHold(Boolean(data.ticket.onHold));
        setAgentTyping(Boolean(data.ticket.agentTyping));
        setReadByAgentAt(data.ticket.lastReadByAgentAt);
      }
      setEspera(data.espera);
      setCall(data.call ?? null);
    } catch {
      // Fetch de red caído o timeout — el próximo tick reintenta solo, no
      // hace falta propagar el error.
    } finally {
      clearTimeout(timeout);
      pollInFlightRef.current = false;
    }
  }

  // Antes esto se apagaba del todo con `!active` (widget minimizado) —
  // pero entonces nunca se enteraba de una llamada entrante mientras estaba
  // cerrado, sin forma de mostrar el badge del ícono flotante. Ahora sigue
  // polleando siempre, solo que mucho más lento cuando no está activo
  // (10s en vez de 1.5s) — alcanza para el badge sin pagar el costo de un
  // poll de chat completo cada 1.5s con la ventana cerrada.
  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, active ? 1500 : 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [active]);

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
    setBusyStage('enviando');
    const tempId = --tempIdCounter;
    setPending((prev) => [
      ...prev,
      { id: tempId, senderType: 'user', messageType: 'text', content: text, createdAt: new Date().toISOString(), attachment: null },
    ]);
    try {
      const res = await fetch('/api/zero-tickets/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) setPending((prev) => prev.filter((m) => m.id !== tempId));
      else poll(); // no await — el mensaje optimista ya está en pantalla, el poll solo reconcilia cuando llegue
    } catch {
      setPending((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setBusyStage(null);
    }
  }

  async function uploadFile(file: File) {
    setBusyStage('subiendo');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/zero-tickets/tickets/attachments', { method: 'POST', body: form });
      if (res.ok) await poll();
      else {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? 'No se pudo subir el archivo.');
      }
    } catch {
      window.alert('No se pudo subir el archivo — revisá tu conexión.');
    } finally {
      setBusyStage(null);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadFile(file);
  }

  async function captureScreenshot(hideWhileCapturing?: HTMLElement | null) {
    // Captura el DOM de la página tal cual se ve, sin pasar por
    // getDisplayMedia: esa API obliga a elegir ventana/pestaña y deja el
    // indicador nativo de "compartiendo pantalla" hasta que alguien lo
    // detenga a mano — no es lo que un botón de "capturar pantalla" debe
    // sentirse como. Con modern-screenshot la imagen sale al toque, sin
    // permisos ni grabación de por medio.
    setBusyStage('capturando');
    try {
      if (hideWhileCapturing) hideWhileCapturing.style.visibility = 'hidden';

      // requestAnimationFrame no dispara en pestañas en segundo plano —
      // un setTimeout corto pinta el frame sin depender de que la pestaña
      // esté compositando, y todo el flujo queda acotado por el timeout.
      const blob = await withTimeout(
        new Promise<void>((resolve) => setTimeout(resolve, 50)).then(() =>
          domToBlob(document.body, {
            type: 'image/png',
            backgroundColor: '#ffffff',
            // El aviso de "tomando captura" (CapturaOverlay) no debe salir
            // dentro de su propia foto.
            filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-capture-exclude')),
            // La lista de mensajes tiene su propio scroll interno — sin esto
            // modern-screenshot pinta el contenedor completo desde arriba,
            // ignorando a dónde está scrolleado en pantalla. Es una feature
            // nativa de la librería (desactivada por default): aplica un
            // transform CSS al clon para simular el scroll, en vez de
            // depender de scrollTop —que no sobrevive la serialización a SVG.
            features: { restoreScrollPosition: true },
          }),
        ),
        // 8000 se quedaba corto en la práctica: domToBlob serializa TODO
        // `document.body` (el dashboard entero, no solo lo visible), y en una
        // página con tablas largas eso solo puede tardar más de 8s en una
        // máquina normal — no es un cuelgue, es trabajo real. El síntoma era
        // "no se puede tomar captura" en capturas que sí iban a terminar,
        // solo que un poco después.
        20000,
      );

      const file = new File([blob], 'captura.png', { type: 'image/png' });
      // uploadFile pone su propio estado ('subiendo') y lo limpia al terminar
      // — acá no se toca busyStage de nuevo para no pisarlo a mitad de subida.
      await uploadFile(file);
    } catch {
      window.alert('No se pudo tomar la captura. Probá adjuntar el archivo manualmente.');
      setBusyStage(null);
    } finally {
      if (hideWhileCapturing) hideWhileCapturing.style.visibility = 'visible';
    }
  }

  return {
    messages,
    pending,
    input,
    loading,
    busyStage,
    status,
    onHold,
    agentTyping,
    espera,
    call,
    readByAgentAt,
    showRating,
    ratingSubmitted,
    ratingValue,
    setRatingValue,
    ratingComment,
    setRatingComment,
    ratingLoading,
    submitRating,
    onInputChange,
    send,
    uploadFile,
    onFileSelected,
    captureScreenshot,
  };
}
