'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LifeBuoy, MessageSquare, Paperclip, Plus, Search, X } from 'lucide-react';
import type { AsistenteEstado } from './use-asistente';
import type { TicketMessage } from '@/lib/hooks/useTicketChat';
import s from './asistente.module.css';

/** Texto plano de una respuesta: sin bloques, enlaces ni marcas, para mostrarlo en una línea. */
function limpiar(t: string | null | undefined, max: number): string {
  return (t ?? '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•\d.)]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const dia = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' })).setHours(0, 0, 0, 0);

function grupoDe(fecha: Date, hoy: number): string {
  const dias = Math.round((hoy - dia(fecha)) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return 'Esta semana';
  if (dias < 31) return 'Este mes';
  return 'Antes';
}

function cuando(fecha: Date, hoy: number): string {
  const dias = Math.round((hoy - dia(fecha)) / 86_400_000);
  if (dias <= 0) return fecha.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' });
  if (dias === 1) return 'Ayer';
  return fecha.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' });
}

interface TicketResumen { id: number; status: string; lastMessageAt: string; titulo: string | null; previa: string | null; mensajes: number }
interface Item {
  clave: string; tipo: 'asistente' | 'soporte'; id: number; titulo: string; previa: string; fecha: Date; mensajes?: number; estado?: string; actual: boolean;
}
type Filtro = 'todo' | 'asistente' | 'soporte';

const ESTADO_TICKET: Record<string, string> = { esperando: 'En espera', abierto: 'Abierto', cerrado: 'Cerrado' };

/** Un ticket anterior, de solo lectura: la conversación tal cual ocurrió. */
function DetalleTicket({ id, alVolver, alIrASoporte }: { id: number; alVolver: () => void; alIrASoporte: () => void }) {
  const [datos, setDatos] = useState<{ estado: string; mensajes: TicketMessage[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/zero-tickets/tickets?id=${id}`, { cache: 'no-store', signal: ac.signal });
        if (!r.ok) { setError(true); return; }
        const d = await r.json();
        setDatos({ estado: d.ticket?.status ?? 'cerrado', mensajes: Array.isArray(d.messages) ? d.messages : [] });
      } catch { if (!ac.signal.aborted) setError(true); }
    })();
    return () => ac.abort();
  }, [id]);

  return (
    <div className={s.hist}>
      <div className={s.histBarra}>
        <button type="button" className={s.histNueva} onClick={alVolver}><ArrowLeft size={15} aria-hidden /> Historial</button>
        <span className={s.histDetalleTitulo}><LifeBuoy size={14} aria-hidden /> Conversación con soporte{datos ? ` · ${ESTADO_TICKET[datos.estado] ?? datos.estado}` : ''}</span>
      </div>
      <div className={s.histCuerpo}>
        {error && <p className={s.errorDerivar} role="alert">No pude abrir esa conversación.</p>}
        {!datos && !error && <ul className={s.histLista} aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className={s.histEsqueleto}><span /><span /></li>)}</ul>}
        {datos && (
          <>
            <ul className={s.histHilo} aria-label="Mensajes del ticket">
              {datos.mensajes.map((m) => (
                <li key={m.id} className={m.senderType === 'user' ? s.histMio : m.senderType === 'agent' ? s.histAgente : s.histSistema}>
                  {m.content && <p>{m.content}</p>}
                  {m.attachment && <span className={s.histAdjunto}><Paperclip size={12} aria-hidden /> {m.attachment.fileName}</span>}
                  <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' })}</time>
                </li>
              ))}
              {datos.mensajes.length === 0 && <li className={s.histSistema}><p>Esta conversación no tiene mensajes.</p></li>}
            </ul>
            <p className={s.histNota}>
              {datos.estado === 'cerrado' ? 'Esta conversación ya se cerró.' : 'Esta conversación sigue abierta.'}
            </p>
            <button type="button" className={s.histNueva} onClick={alIrASoporte}>
              <LifeBuoy size={15} aria-hidden /> {datos.estado === 'cerrado' ? 'Escribir a soporte' : 'Continuar con soporte'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pantalla aparte con el historial de las dos vías de ayuda: las conversaciones con el asistente y los
 * chats con soporte. Se busca, se filtra, se agrupa por fecha y al elegir una se abre donde corresponde
 * (el asistente en su chat; soporte, en su pestaña o, si ya terminó, en una vista de solo lectura).
 */
export function HistorialAsistente({ a, alAbrir, alAbrirSoporte }: { a: AsistenteEstado; alAbrir: () => void; alAbrirSoporte: () => void }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [falla, setFalla] = useState(false);
  const [tickets, setTickets] = useState<TicketResumen[] | null>(null);
  const [ticketAbierto, setTicketAbierto] = useState<number | null>(null);
  const { cargarConversaciones } = a;

  const cargarTickets = useCallback(async () => {
    try {
      const r = await fetch('/api/zero-tickets/tickets?historial=1', { cache: 'no-store' });
      if (!r.ok) { setTickets([]); return; }
      const d = await r.json();
      setTickets(Array.isArray(d.tickets) ? d.tickets : []);
    } catch { setTickets([]); }
  }, []);

  useEffect(() => { void cargarConversaciones(); void cargarTickets(); }, [cargarConversaciones, cargarTickets]);

  const { lista, total, hoy, cuentas } = useMemo(() => {
    const hoyDia = dia(new Date());
    const t = q.trim().toLowerCase();
    const deAsistente: Item[] = a.conversaciones.map((c) => ({
      clave: `a-${c.id}`, tipo: 'asistente', id: c.id, titulo: limpiar(c.titulo, 90) || 'Conversación', previa: limpiar(c.previa, 110),
      fecha: new Date(c.actualizadaEn), mensajes: c.mensajes, actual: c.id === a.conversacionId,
    }));
    const deSoporte: Item[] = (tickets ?? []).map((k, i) => {
      // Un ticket que nació de «hablar con una persona» trae la conversación con el asistente pegada: se resume.
      const derivado = /^Pidió hablar con una persona/i.test(k.titulo ?? '');
      const pregunta = derivado ? (k.titulo ?? '').match(/Cliente:\s*([^\n]+)/)?.[1] : undefined;
      return {
        clave: `t-${k.id}`, tipo: 'soporte', id: k.id,
        titulo: derivado ? 'Pasó del asistente a soporte' : limpiar(k.titulo, 90) || 'Chat con soporte',
        previa: derivado ? limpiar(pregunta ? `Empezó con: ${pregunta}` : '', 110) : limpiar(k.previa, 110),
        fecha: new Date(k.lastMessageAt), mensajes: k.mensajes, estado: k.status,
        // El más reciente es el que muestra la pestaña «Soporte».
        actual: i === 0,
      } satisfies Item;
    });
    const todos = [...deAsistente, ...deSoporte].sort((x, y) => y.fecha.getTime() - x.fecha.getTime());
    const visibles = todos
      .filter((c) => filtro === 'todo' || c.tipo === filtro)
      .filter((c) => !t || c.titulo.toLowerCase().includes(t) || c.previa.toLowerCase().includes(t));
    const por = new Map<string, Item[]>();
    for (const c of visibles) {
      const g = grupoDe(c.fecha, hoyDia);
      por.set(g, [...(por.get(g) ?? []), c]);
    }
    return {
      lista: [...por.entries()], total: visibles.length, hoy: hoyDia,
      cuentas: { todo: todos.length, asistente: deAsistente.length, soporte: deSoporte.length },
    };
  }, [a.conversaciones, a.conversacionId, tickets, q, filtro]);

  async function abrir(c: Item) {
    if (abriendo != null) return;
    setFalla(false);
    if (c.tipo === 'soporte') {
      // El más reciente vive en la pestaña «Soporte» (con envío, llamada y calificación); los demás se leen aquí.
      if (c.actual) alAbrirSoporte(); else setTicketAbierto(c.id);
      return;
    }
    setAbriendo(c.id);
    const ok = await a.abrirConversacion(c.id);
    setAbriendo(null);
    if (ok) alAbrir(); else setFalla(true);
  }

  if (ticketAbierto != null) {
    return <DetalleTicket id={ticketAbierto} alVolver={() => setTicketAbierto(null)} alIrASoporte={alAbrirSoporte} />;
  }

  const cargando = (a.cargandoConversaciones && a.conversaciones.length === 0) || tickets === null;

  return (
    <div className={s.hist}>
      <div className={s.histBarra}>
        <label className={s.histBuscar}>
          <Search size={15} aria-hidden />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80}
            placeholder="Buscar en tus conversaciones" aria-label="Buscar en tus conversaciones"
          />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Borrar la búsqueda"><X size={14} aria-hidden /></button>}
        </label>
        <button type="button" className={s.histNueva} onClick={() => { a.nueva(); alAbrir(); }}>
          <Plus size={15} aria-hidden /> Nueva
        </button>
      </div>

      <div className={s.histFiltros} role="group" aria-label="Qué conversaciones ver">
        {([['todo', 'Todo'], ['asistente', 'Asistente'], ['soporte', 'Soporte']] as const).map(([k, etiqueta]) => (
          <button key={k} type="button" aria-pressed={filtro === k} className={`${s.histFiltro} ${filtro === k ? s.histFiltroOn : ''}`} onClick={() => setFiltro(k)}>
            {etiqueta}<span>{cuentas[k]}</span>
          </button>
        ))}
      </div>

      {falla && <p className={s.errorDerivar} role="alert">No pude abrir esa conversación. Intenta de nuevo.</p>}

      <div className={s.histCuerpo}>
        {cargando && (
          <ul className={s.histLista} aria-busy="true" aria-label="Cargando conversaciones">
            {[0, 1, 2, 3].map((i) => <li key={i} className={s.histEsqueleto}><span /><span /></li>)}
          </ul>
        )}

        {!cargando && cuentas.todo === 0 && (
          <div className={s.histVacio}>
            <MessageSquare size={22} aria-hidden />
            <strong>Todavía no hay conversaciones</strong>
            <p>Tus consultas al asistente y tus chats con soporte quedan aquí para retomarlos.</p>
          </div>
        )}

        {!cargando && cuentas.todo > 0 && total === 0 && (
          <div className={s.histVacio}>
            <Search size={22} aria-hidden />
            <strong>Sin resultados</strong>
            <p>{q.trim() ? `Ninguna conversación menciona «${q.trim()}».` : filtro === 'soporte' ? 'Todavía no has escrito a soporte.' : 'Todavía no hay conversaciones con el asistente.'}</p>
          </div>
        )}

        {lista.map(([nombre, items]) => (
          <section key={nombre} className={s.histGrupo} aria-label={nombre}>
            <h4>{nombre}</h4>
            <ul className={s.histLista}>
              {items.map((c) => (
                <li key={c.clave}>
                  <button
                    type="button" className={`${s.histItem} ${c.actual && c.tipo === 'asistente' ? s.histActual : ''}`} onClick={() => void abrir(c)}
                    disabled={abriendo != null} aria-current={c.actual && c.tipo === 'asistente' ? 'true' : undefined}
                  >
                    <span className={s.histIcono} aria-hidden>{c.tipo === 'soporte' ? <LifeBuoy size={14} /> : <MessageSquare size={14} />}</span>
                    <span className={s.histTexto}>
                      <span className={s.histTitulo}>{c.titulo}</span>
                      {c.previa && <span className={s.histPrevia}>{c.previa}</span>}
                      <span className={s.histEtiquetas}>
                        <span>{c.tipo === 'soporte' ? 'Soporte' : 'Asistente'}</span>
                        {c.tipo === 'soporte' && c.estado && <span className={c.estado === 'cerrado' ? undefined : s.histVivo}>{ESTADO_TICKET[c.estado] ?? c.estado}</span>}
                      </span>
                    </span>
                    <span className={s.histMeta}>
                      <span>{cuando(c.fecha, hoy)}</span>
                      {c.actual && c.tipo === 'asistente' ? <em>Abierta</em> : c.mensajes != null && c.mensajes > 0 ? <small>{c.mensajes} msj.</small> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {((filtro !== 'soporte' && a.conversaciones.length >= 50) || (filtro !== 'asistente' && (tickets?.length ?? 0) >= 50)) && <p className={s.histNota}>Se muestran las 50 más recientes de cada tipo.</p>}
      </div>
    </div>
  );
}
