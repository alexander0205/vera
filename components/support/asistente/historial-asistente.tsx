'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus, Search, X } from 'lucide-react';
import type { AsistenteEstado } from './use-asistente';
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

/**
 * Pantalla aparte con las conversaciones anteriores: se llega desde la pestaña «Historial»,
 * se busca, se agrupa por fecha y al elegir una se vuelve al chat con ella abierta.
 */
export function HistorialAsistente({ a, alAbrir }: { a: AsistenteEstado; alAbrir: () => void }) {
  const [q, setQ] = useState('');
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [falla, setFalla] = useState(false);
  const { cargarConversaciones } = a;

  useEffect(() => { void cargarConversaciones(); }, [cargarConversaciones]);

  const grupos = useMemo(() => {
    const hoy = dia(new Date());
    const t = q.trim().toLowerCase();
    const items = a.conversaciones
      .map((c) => ({ ...c, titulo: limpiar(c.titulo, 90) || 'Conversación', previa: limpiar(c.previa, 110), fecha: new Date(c.actualizadaEn) }))
      .filter((c) => !t || c.titulo.toLowerCase().includes(t) || c.previa.toLowerCase().includes(t));
    const por = new Map<string, typeof items>();
    for (const c of items) {
      const g = grupoDe(c.fecha, hoy);
      por.set(g, [...(por.get(g) ?? []), c]);
    }
    return { lista: [...por.entries()], total: items.length, hoy };
  }, [a.conversaciones, q]);

  async function abrir(id: number) {
    if (abriendo != null) return;
    setAbriendo(id);
    setFalla(false);
    const ok = await a.abrirConversacion(id);
    setAbriendo(null);
    if (ok) alAbrir(); else setFalla(true);
  }

  const cargando = a.cargandoConversaciones && a.conversaciones.length === 0;

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

      {falla && <p className={s.errorDerivar} role="alert">No pude abrir esa conversación. Intenta de nuevo.</p>}

      <div className={s.histCuerpo}>
        {cargando && (
          <ul className={s.histLista} aria-busy="true" aria-label="Cargando conversaciones">
            {[0, 1, 2, 3].map((i) => <li key={i} className={s.histEsqueleto}><span /><span /></li>)}
          </ul>
        )}

        {!cargando && a.conversaciones.length === 0 && (
          <div className={s.histVacio}>
            <MessageSquare size={22} aria-hidden />
            <strong>Todavía no hay conversaciones</strong>
            <p>Cuando le preguntes algo al asistente, tus consultas quedan aquí para retomarlas.</p>
          </div>
        )}

        {!cargando && a.conversaciones.length > 0 && grupos.total === 0 && (
          <div className={s.histVacio}>
            <Search size={22} aria-hidden />
            <strong>Sin resultados</strong>
            <p>Ninguna conversación menciona «{q.trim()}».</p>
          </div>
        )}

        {grupos.lista.map(([nombre, items]) => (
          <section key={nombre} className={s.histGrupo} aria-label={nombre}>
            <h4>{nombre}</h4>
            <ul className={s.histLista}>
              {items.map((c) => {
                const actual = c.id === a.conversacionId;
                return (
                  <li key={c.id}>
                    <button
                      type="button" className={`${s.histItem} ${actual ? s.histActual : ''}`} onClick={() => void abrir(c.id)}
                      disabled={abriendo != null} aria-current={actual ? 'true' : undefined}
                    >
                      <span className={s.histIcono} aria-hidden><MessageSquare size={14} /></span>
                      <span className={s.histTexto}>
                        <span className={s.histTitulo}>{c.titulo}</span>
                        {c.previa && <span className={s.histPrevia}>{c.previa}</span>}
                      </span>
                      <span className={s.histMeta}>
                        <span>{cuando(c.fecha, grupos.hoy)}</span>
                        {actual ? <em>Abierta</em> : c.mensajes != null && c.mensajes > 0 ? <small>{c.mensajes} msj.</small> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {a.conversaciones.length >= 50 && <p className={s.histNota}>Se muestran tus 50 conversaciones más recientes.</p>}
      </div>
    </div>
  );
}
