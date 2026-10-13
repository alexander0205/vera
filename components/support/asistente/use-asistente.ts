'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { armarResumenParaAgente } from '@/lib/asistente/derivar';

export interface MensajeAsistente {
  /** Id de la base; los mensajes que aún no se guardan llevan un id negativo. */
  id: number;
  rol: 'user' | 'assistant';
  contenido: string;
  herramientas?: { nombre: string; resumen: string }[] | null;
  /** La respuesta falló: se muestra como error con «Reintentar». */
  error?: boolean;
}

/**
 * Estado del asistente de solo lectura. No hace nada hasta que el panel se
 * abre (`activo`): así quien nunca abre el chat no paga ni una petición.
 */
export function useAsistente(activo: boolean) {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [mensajes, setMensajes] = useState<MensajeAsistente[]>([]);
  const [conversacionId, setConversacionId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [derivando, setDerivando] = useState(false);
  const [derivada, setDerivada] = useState(false);
  const [perfil, setPerfil] = useState<{ usuario: string | null; empresa: string | null }>({ usuario: null, empresa: null });
  const cargado = useRef(false);
  const idTemporal = useRef(-1);

  useEffect(() => {
    if (!activo || cargado.current) return;
    cargado.current = true;
    (async () => {
      try {
        const r = await fetch('/api/asistente', { cache: 'no-store' });
        if (!r.ok) { setDisponible(false); return; }
        const d = await r.json();
        setDisponible(Boolean(d.disponible));
        setPerfil({ usuario: d.usuario ?? null, empresa: d.empresa ?? null });
        if (d.conversacion) {
          setConversacionId(d.conversacion.id);
          setDerivada(Boolean(d.conversacion.derivada));
          setMensajes(d.conversacion.mensajes.map((m: MensajeAsistente) => ({
            id: m.id, rol: m.rol, contenido: m.contenido, herramientas: m.herramientas ?? null,
          })));
        }
      } catch {
        // Sin red: el widget sigue siendo el de soporte de siempre.
        setDisponible(false);
      }
    })();
  }, [activo]);

  const preguntar = useCallback(async (texto: string, convId: number | null) => {
    setEnviando(true);
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto, conversacionId: convId }),
      });
      const d = await r.json().catch(() => ({}));
      if (typeof d.conversacionId === 'number') setConversacionId(d.conversacionId);
      if (!r.ok) {
        const msg = d.error ?? 'No pude responder. Intenta de nuevo.';
        setMensajes((m) => [...m, { id: idTemporal.current--, rol: 'assistant', contenido: msg, error: true }]);
        return;
      }
      setMensajes((m) => [...m, {
        id: d.mensaje.id, rol: 'assistant', contenido: d.mensaje.contenido, herramientas: d.mensaje.herramientas,
      }]);
    } catch {
      setMensajes((m) => [...m, {
        id: idTemporal.current--, rol: 'assistant', error: true,
        contenido: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
      }]);
    } finally {
      setEnviando(false);
    }
  }, []);

  const enviar = useCallback(async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setMensajes((m) => [...m, { id: idTemporal.current--, rol: 'user', contenido: limpio }]);
    await preguntar(limpio, conversacionId);
  }, [enviando, preguntar, conversacionId]);

  /** Reintenta la última pregunta tras un error (quita el mensaje de error). */
  const reintentar = useCallback(async () => {
    if (enviando) return;
    const ultima = [...mensajes].reverse().find((m) => m.rol === 'user');
    if (!ultima) return;
    setMensajes((m) => m.filter((x) => !x.error));
    await preguntar(ultima.contenido, conversacionId);
  }, [enviando, mensajes, preguntar, conversacionId]);

  const nueva = useCallback(() => {
    setMensajes([]);
    setConversacionId(null);
    setDerivada(false);
  }, []);

  /**
   * Abre el ticket de soporte con la conversación como primer mensaje. Usa la
   * misma ruta que el chat de soporte de siempre: el agente la ve igual que
   * cualquier ticket y las alertas a Slack salen solas.
   */
  const derivar = useCallback(async (): Promise<boolean> => {
    if (derivando) return false;
    setDerivando(true);
    try {
      const contenido = armarResumenParaAgente(
        mensajes.filter((m) => !m.error).map((m) => ({ rol: m.rol, contenido: m.contenido })),
      );
      const r = await fetch('/api/zero-tickets/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contenido }),
      });
      if (!r.ok) return false;
      setDerivada(true);
      return true;
    } catch {
      return false;
    } finally {
      setDerivando(false);
    }
  }, [derivando, mensajes]);

  return { disponible, perfil, mensajes, enviando, derivando, derivada, enviar, reintentar, nueva, derivar };
}

export type AsistenteEstado = ReturnType<typeof useAsistente>;
