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
  /** 1 = útil, -1 = no útil. */
  valoracion?: 1 | -1 | null;
  /** Por qué no sirvió (solo con 👎). */
  valoracionMotivo?: string | null;
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
  // cargando → listo | no-aplica (no es dueño/admin) | error (la red o el servidor fallaron).
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no-aplica' | 'error'>('cargando');
  const estadoRef = useRef<'cargando' | 'listo' | 'no-aplica' | 'error'>('cargando');
  const fijarEstado = useCallback((e: 'cargando' | 'listo' | 'no-aplica' | 'error') => { estadoRef.current = e; setEstado(e); }, []);
  const [mensajes, setMensajes] = useState<MensajeAsistente[]>([]);
  const [conversacionId, setConversacionId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [derivando, setDerivando] = useState(false);
  const [derivada, setDerivada] = useState(false);
  const [errorDerivar, setErrorDerivar] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<{ usuario: string | null; empresa: string | null; sugerencias: { texto: string; icono: string }[] | null }>({ usuario: null, empresa: null, sugerencias: null });
  const idTemporal = useRef(-1);

  // La carga reintenta sola (la primera compilación o un corte breve no deben
  // dejar la persona sin asistente hasta recargar) y, si igual falla, queda en
  // «error» con un botón para reintentar en vez de esconder las pestañas.
  const cargando = useRef(false);
  const cargar = useCallback(async () => {
    if (cargando.current) return;
    cargando.current = true;
    fijarEstado('cargando');
    try {
      for (const espera of [0, 1000, 2500]) {
        if (espera) await new Promise((r) => setTimeout(r, espera));
        try {
          const r = await fetch('/api/asistente', { cache: 'no-store' });
          // 401/403: no aplica para esta persona, y reintentar no lo cambia.
          if (r.status === 401 || r.status === 403) { fijarEstado('no-aplica'); return; }
          if (!r.ok) continue;
          const d = await r.json();
          if (!d.disponible) { fijarEstado('no-aplica'); return; }
          setPerfil({ usuario: d.usuario ?? null, empresa: d.empresa ?? null, sugerencias: Array.isArray(d.sugerencias) ? d.sugerencias : null });
          if (d.conversacion) {
            setConversacionId(d.conversacion.id);
            setDerivada(Boolean(d.conversacion.derivada));
            setMensajes(d.conversacion.mensajes.map((m: MensajeAsistente) => ({
              id: m.id, rol: m.rol, contenido: m.contenido, herramientas: m.herramientas ?? null, grande: m.grande,
              valoracion: m.valoracion ?? null, valoracionMotivo: m.valoracionMotivo ?? null,
            })));
          }
          fijarEstado('listo');
          return;
        } catch {
          // Sin red por un momento: se reintenta.
        }
      }
      fijarEstado('error');
    } finally {
      cargando.current = false;
    }
  }, [fijarEstado]);

  // Carga cuando hace falta (al abrir o al precargar) y no estaba ya resuelto.
  useEffect(() => {
    if (!activo) return;
    if (estadoRef.current === 'listo' || estadoRef.current === 'no-aplica') return;
    void cargar();
  }, [activo, cargar]);

  const preguntar = useCallback(async (texto: string, convId: number | null) => {
    setEnviando(true);
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto, conversacionId: convId, pantalla: window.location.pathname }),
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

  /** 👍 / 👎 sobre una respuesta. Volver a pulsar la misma la quita. */
  const valorar = useCallback(async (mensajeId: number, valor: 1 | -1, motivo?: string) => {
    let anterior: 1 | -1 | null | undefined;
    setMensajes((ms) => ms.map((m) => {
      if (m.id !== mensajeId) return m;
      anterior = m.valoracion;
      return { ...m, valoracion: m.valoracion === valor ? null : valor, valoracionMotivo: null };
    }));
    const nuevo = anterior === valor ? 0 : valor;
    try {
      const r = await fetch('/api/asistente/valorar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajeId, valor: nuevo, motivo }),
      });
      if (!r.ok) throw new Error('no guardó');
    } catch {
      // No se pudo guardar: se deshace para no mostrar algo que no quedó.
      setMensajes((ms) => ms.map((m) => (m.id === mensajeId ? { ...m, valoracion: anterior ?? null } : m)));
    }
  }, []);

  /** El motivo de un 👎: se guarda sobre la misma valoración, sin quitarla. */
  const motivar = useCallback(async (mensajeId: number, motivo: string) => {
    let anterior: string | null | undefined;
    setMensajes((ms) => ms.map((m) => {
      if (m.id !== mensajeId) return m;
      anterior = m.valoracionMotivo;
      return { ...m, valoracion: -1, valoracionMotivo: motivo };
    }));
    try {
      const r = await fetch('/api/asistente/valorar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajeId, valor: -1, motivo }),
      });
      if (!r.ok) throw new Error('no guardó');
    } catch {
      setMensajes((ms) => ms.map((m) => (m.id === mensajeId ? { ...m, valoracionMotivo: anterior ?? null } : m)));
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

  const disponible = estado === 'listo' ? true : estado === 'no-aplica' ? false : null;
  const reintentar_carga = cargar;

  return { estado, reintentarCarga: reintentar_carga, disponible, perfil, mensajes, enviando, derivando, derivada, errorDerivar, enviar, reintentar, nueva, derivar, resolverPropuesta, valorar, motivar };
}

export type AsistenteEstado = ReturnType<typeof useAsistente>;
