'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface MensajeAsistente {
  /** Id de la base; los mensajes que aún no se guardan llevan un id negativo. */
  id: number;
  rol: 'user' | 'assistant';
  contenido: string;
  herramientas?: { nombre: string; resumen: string }[] | null;
  /** Respuesta larga o con tabla grande: el PDF se ofrece con más énfasis. */
  grande?: boolean;
  /** Acciones que esperan «Confirmar». Viven solo mientras el token es válido (5 min). */
  propuestas?: { token: string; tipo: 'crear' | 'modificar' | 'eliminar'; destructiva: boolean; resumen: string; estado?: 'pendiente' | 'confirmando' | 'hecha' | 'cancelada' | 'error'; resultado?: string; enlace?: string }[];
  /** La respuesta falló: se muestra como error con «Reintentar». */
  error?: boolean;
}

/** Descarga el PDF de una respuesta (mismo origen: la cookie de sesión viaja sola). */
export function descargarPdf(mensajeId: number) {
  const a = document.createElement('a');
  a.href = `/api/asistente/pdf?mensajeId=${mensajeId}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  const [errorDerivar, setErrorDerivar] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<{ usuario: string | null; empresa: string | null }>({ usuario: null, empresa: null });
  const cargado = useRef(false);
  const idTemporal = useRef(-1);

  // Se marca como cargado solo si la respuesta llegó: un corte de red al abrir
  // no deja el asistente apagado hasta recargar; se reintenta al reabrir.
  const cargando = useRef(false);
  useEffect(() => {
    if (!activo || cargado.current || cargando.current) return;
    cargando.current = true;
    (async () => {
      try {
        const r = await fetch('/api/asistente', { cache: 'no-store' });
        if (!r.ok) {
          // 401/403: no aplica para esta persona, y eso no cambia al reabrir.
          if (r.status < 500) cargado.current = true;
          setDisponible(false);
          return;
        }
        const d = await r.json();
        cargado.current = true;
        setDisponible(Boolean(d.disponible));
        setPerfil({ usuario: d.usuario ?? null, empresa: d.empresa ?? null });
        if (d.conversacion) {
          setConversacionId(d.conversacion.id);
          setDerivada(Boolean(d.conversacion.derivada));
          setMensajes(d.conversacion.mensajes.map((m: MensajeAsistente) => ({
            id: m.id, rol: m.rol, contenido: m.contenido, herramientas: m.herramientas ?? null, grande: m.grande,
          })));
        }
      } catch {
        // Sin red: por ahora el soporte de siempre; se reintenta al reabrir.
        setDisponible(false);
      } finally {
        cargando.current = false;
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
        id: d.mensaje.id, rol: 'assistant', contenido: d.mensaje.contenido, herramientas: d.mensaje.herramientas, grande: d.mensaje.grande,
        propuestas: (d.mensaje.propuestas ?? []).map((p: NonNullable<MensajeAsistente['propuestas']>[number]) => ({ ...p, estado: 'pendiente' as const })),
      }]);
      if (typeof d.descargarMensajeId === 'number') descargarPdf(d.descargarMensajeId);
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

  /** El único camino a ejecutar una acción: el botón «Confirmar» de la tarjeta. */
  const resolverPropuesta = useCallback(async (mensajeId: number, token: string, confirmar: boolean) => {
    const cambiar = (patch: Partial<NonNullable<MensajeAsistente['propuestas']>[number]>) =>
      setMensajes((ms) => ms.map((m) => (m.id !== mensajeId ? m : {
        ...m, propuestas: m.propuestas?.map((p) => (p.token === token ? { ...p, ...patch } : p)),
      })));
    if (!confirmar) { cambiar({ estado: 'cancelada' }); return; }
    cambiar({ estado: 'confirmando' });
    try {
      const r = await fetch('/api/asistente/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { cambiar({ estado: 'error', resultado: d.error ?? 'No se pudo completar la acción.' }); return; }
      cambiar({ estado: 'hecha', resultado: d.mensaje, enlace: d.enlace });
    } catch {
      cambiar({ estado: 'error', resultado: 'No hay conexión. No se hizo ningún cambio.' });
    }
  }, []);

  const nueva = useCallback(() => {
    setMensajes([]);
    setConversacionId(null);
    setDerivada(false);
    setErrorDerivar(null);
  }, []);

  /**
   * Abre el ticket de soporte con la conversación como primer mensaje. El
   * servidor arma el resumen con lo guardado, abre el ticket igual que el chat
   * de soporte (alertas a Slack incluidas) y anota en la conversación a qué
   * ticket pasó, para no derivarla dos veces.
   */
  const derivar = useCallback(async (): Promise<boolean> => {
    if (derivando || conversacionId == null) return false;
    setDerivando(true);
    setErrorDerivar(null);
    try {
      const r = await fetch('/api/asistente/derivar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErrorDerivar(d.error ?? 'No se pudo abrir el ticket. Intenta de nuevo.');
        return false;
      }
      setDerivada(true);
      return true;
    } catch {
      setErrorDerivar('No hay conexión. Revisa tu internet e intenta de nuevo.');
      return false;
    } finally {
      setDerivando(false);
    }
  }, [derivando, conversacionId]);

  return { disponible, perfil, mensajes, enviando, derivando, derivada, errorDerivar, enviar, reintentar, nueva, derivar, resolverPropuesta };
}

export type AsistenteEstado = ReturnType<typeof useAsistente>;
