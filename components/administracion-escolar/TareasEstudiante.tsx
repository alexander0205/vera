'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Drawer from '@mui/material/Drawer';
import { ArrowLeft, Bell, Check, Loader2, Plus, Sparkles, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { ETIQUETA_ASIGNACION, type Asignacion } from '@/lib/administracion-escolar/tareas-reglas';

/**
 * Las tareas por revisar de un alumno y de su familia, desde su ficha.
 *
 * Dos botones con su número —el del alumno y el de la familia— abren un panel
 * a la derecha. Ahí está la lista (abiertas o el historial), y cada tarea se
 * lleva como una conversación: lo que se dijo, quién la creó, quién la marcó
 * como completada. Las tareas las crea una persona del colegio, el equipo de
 * Zero (firma «Soporte IT · Zero») o Zero AI.
 */

interface Conteo { alumno: number; familia: number }
interface TareaEnLista {
  id: number; titulo: string; estado: 'abierta' | 'completada'; de: string; asignada: string;
  documento: string | null; creadaPorIa: boolean; venceEl: string | null;
  ultimo: { autor: string; texto: string; tipo: string; creadoEn: string } | null;
  mensajes: number; actualizadoEn: string;
}
interface Mensaje { id: number; tipo: 'mensaje' | 'evento' | 'ia'; userId: number | null; autor: string; texto: string; creadoEn: string }
interface TareaCompleta {
  id: number; titulo: string; estado: 'abierta' | 'completada'; de: string; asignada: string;
  documento: string | null; ecfDocumentId: number | null; creadaPorIa: boolean; venceEl: string | null; mensajes: Mensaje[];
}

type Vista = { tipo: 'lista' } | { tipo: 'hilo'; id: number } | { tipo: 'nueva' };

const traer = (url: string) => fetch(url).then(async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'No se pudo cargar');
  return d;
});

/** «hoy 9:40», «ayer 16:20» o «12 oct». */
function cuando(iso: string) {
  const f = new Date(iso);
  const hoy = new Date();
  const hora = f.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' });
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (dia(f) === dia(hoy)) return `hoy ${hora}`;
  if (dia(f) === dia(ayer)) return `ayer ${hora}`;
  return f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' });
}

const iniciales = (nombre: string) => {
  if (nombre.startsWith('Soporte IT')) return 'IT';
  if (nombre === 'Zero AI') return 'AI';
  const p = nombre.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? ''}`.toUpperCase() || '·';
};

const Segmento = <T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { id: T; texto: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string;
}) => (
  <div role="group" aria-label={etiqueta} className="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
    {opciones.map((o) => (
      <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => onCambio(o.id)}
        className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${
          valor === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
        {o.texto}
      </button>
    ))}
  </div>
);

export function TareasEstudiante({ estudianteId, nombre, puedeGestionar }: {
  estudianteId: number;
  /** El nombre corto del alumno, para los botones y el panel. */
  nombre: string;
  puedeGestionar: boolean;
}) {
  const base = '/api/administracion-escolar/tareas';
  const { data: dataConteo, mutate: mutarConteo } = useSWR<{ conteo: Conteo }>(
    `${base}?estudianteId=${estudianteId}&soloConteo=1`, traer, { revalidateOnFocus: false });
  const conteo = dataConteo?.conteo ?? { alumno: 0, familia: 0 };

  const [abierto, setAbierto] = useState(false);
  const [alcance, setAlcance] = useState<'alumno' | 'familia'>('alumno');
  const [estado, setEstado] = useState<'abierta' | 'completada'>('abierta');
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });

  const claveLista = abierto ? `${base}?estudianteId=${estudianteId}&alcance=${alcance}&estado=${estado}` : null;
  const { data: dataLista, isLoading: cargandoLista, mutate: mutarLista } = useSWR<{
    tareas: TareaEnLista[]; familia: { tieneResponsable: boolean; alumnos: string[] };
  }>(claveLista, traer);

  const claveHilo = abierto && vista.tipo === 'hilo' ? `${base}/${vista.id}` : null;
  const { data: dataHilo, mutate: mutarHilo } = useSWR<{ tarea: TareaCompleta; yo: number }>(claveHilo, traer);

  const abrir = (a: 'alumno' | 'familia') => {
    setAlcance(a); setEstado('abierta'); setVista({ tipo: 'lista' }); setAbierto(true);
  };
  const refrescar = () => { void mutarConteo(); void mutarLista(); void mutarHilo(); };

  const titulo = vista.tipo === 'hilo' ? (dataHilo?.tarea.titulo ?? 'Tarea')
    : vista.tipo === 'nueva' ? 'Nueva tarea' : 'Tareas por revisar';
  const subtitulo = vista.tipo === 'hilo' ? 'La conversación de esta tarea'
    : vista.tipo === 'nueva' ? 'Algo que alguien tiene que decidir o arreglar'
    : alcance === 'alumno' ? `De ${nombre} · ${conteo.alumno} abierta(s)`
    : `De toda la familia · ${conteo.familia} abierta(s)`;

  return (
    <>
      <button type="button" onClick={() => abrir('alumno')}
        title={`Tareas por revisar de ${nombre}`}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors ${
          conteo.alumno > 0 ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
        <Bell className="h-4 w-4" />Tareas
        <span className={`min-w-5 rounded-full px-1.5 text-[11px] font-bold tabular-nums ${conteo.alumno > 0 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          {conteo.alumno}
        </span>
      </button>
      {conteo.familia > conteo.alumno && (
        <button type="button" onClick={() => abrir('familia')}
          title="Tareas por revisar de toda la familia"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Users className="h-4 w-4" />Familia
          <span className="min-w-5 rounded-full bg-gray-100 px-1.5 text-[11px] font-bold tabular-nums text-gray-700">{conteo.familia}</span>
        </button>
      )}

      <Drawer anchor="right" open={abierto} onClose={() => setAbierto(false)} keepMounted={false}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
        <div className="flex h-full flex-col">
          <div className="space-y-3 border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2">
              {vista.tipo !== 'lista' && (
                <button type="button" onClick={() => { setVista({ tipo: 'lista' }); void mutarLista(); }}
                  aria-label="Volver a la lista de tareas"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-gray-900">{titulo}</h2>
                <p className="text-xs text-gray-500">{subtitulo}</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            {vista.tipo === 'lista' && (
              <div className="flex flex-wrap gap-2">
                <Segmento etiqueta="De quién" valor={alcance} onCambio={setAlcance}
                  opciones={[{ id: 'alumno', texto: nombre }, { id: 'familia', texto: 'Toda la familia' }]} />
                <Segmento etiqueta="Estado" valor={estado} onCambio={setEstado}
                  opciones={[{ id: 'abierta', texto: 'Abiertas' }, { id: 'completada', texto: 'Historial' }]} />
              </div>
            )}
            {vista.tipo === 'hilo' && dataHilo && <CabeceraHilo tarea={dataHilo.tarea} />}
          </div>

          {vista.tipo === 'lista' && (
            <>
              <div className="flex-1 overflow-y-auto p-2">
                {cargandoLista && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>}
                {!cargandoLista && (dataLista?.tareas ?? []).length === 0 && (
                  <p className="px-4 py-10 text-center text-sm text-gray-500">
                    {estado === 'abierta' ? 'No hay tareas abiertas.' : 'Todavía no hay tareas completadas.'}
                  </p>
                )}
                {(dataLista?.tareas ?? []).map((t) => (
                  <button key={t.id} type="button" onClick={() => setVista({ tipo: 'hilo', id: t.id })}
                    className="flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-gray-50">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.estado === 'completada' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-gray-500">{cuando(t.ultimo?.creadoEn ?? t.actualizadoEn)}</span>
                      </span>
                      {t.ultimo && (
                        <span className="block truncate text-xs text-gray-600">
                          {t.ultimo.tipo !== 'evento' && <strong className="font-semibold text-gray-700">{t.ultimo.autor}: </strong>}
                          {t.ultimo.texto}
                        </span>
                      )}
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                        {t.de} · {t.asignada}
                        {t.creadaPorIa && <span className="rounded bg-violet-50 px-1.5 font-semibold text-violet-700">Zero AI</span>}
                        {t.documento && <span className="font-mono text-zero-700">{t.documento}</span>}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {puedeGestionar && (
                <div className="border-t border-gray-100 px-5 py-3">
                  <button type="button" onClick={() => setVista({ tipo: 'nueva' })}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-zero-600 text-sm font-semibold text-white hover:bg-zero-700">
                    <Plus className="h-4 w-4" />Nueva tarea
                  </button>
                </div>
              )}
            </>
          )}

          {vista.tipo === 'hilo' && (
            dataHilo
              ? <Hilo tarea={dataHilo.tarea} yo={dataHilo.yo} puedeGestionar={puedeGestionar} onCambio={refrescar} />
              : <div className="flex flex-1 justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
          )}

          {vista.tipo === 'nueva' && (
            <NuevaTarea estudianteId={estudianteId} nombre={nombre}
              familiaPosible={dataLista?.familia.tieneResponsable ?? true}
              onCreada={(id) => { refrescar(); setVista({ tipo: 'hilo', id }); }} />
          )}
        </div>
      </Drawer>
    </>
  );
}

function CabeceraHilo({ tarea }: { tarea: TareaCompleta }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className={`rounded-md px-2 py-0.5 font-semibold ${tarea.estado === 'completada' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {tarea.estado === 'completada' ? 'Completada' : 'Abierta'}
      </span>
      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">{tarea.de}</span>
      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">Asignada a {tarea.asignada}</span>
      {tarea.documento && tarea.ecfDocumentId && (
        <a href={`/dashboard/facturas/${tarea.ecfDocumentId}`} className="rounded-md bg-zero-50 px-2 py-0.5 font-mono font-semibold text-zero-700 hover:underline">
          {tarea.documento}
        </a>
      )}
      {tarea.venceEl && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">Para el {tarea.venceEl.split('-').reverse().join('/')}</span>}
    </div>
  );
}

function Hilo({ tarea, yo, puedeGestionar, onCambio }: {
  tarea: TareaCompleta; yo: number; puedeGestionar: boolean; onCambio: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}/mensajes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo enviar');
      setTexto('');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally { setEnviando(false); }
  }

  async function marcar() {
    setEnviando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: tarea.estado === 'abierta' ? 'completar' : 'reabrir' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cambiar');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally { setEnviando(false); }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-gray-50/60 px-5 py-4">
        {tarea.mensajes.map((m) => {
          if (m.tipo === 'evento') {
            const cerrada = m.texto.includes('completada');
            return (
              <p key={m.id} className={`self-center rounded-full px-3 py-1 text-center text-[11px] font-medium ${cerrada ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                {m.texto} · {cuando(m.creadoEn)}
              </p>
            );
          }
          const mio = m.userId === yo && m.tipo === 'mensaje';
          const ia = m.tipo === 'ia';
          return (
            <div key={m.id} className={`flex items-start gap-2 ${mio ? 'flex-row-reverse' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                mio ? 'bg-zero-600 text-white' : ia ? 'bg-violet-600 text-white' : m.autor.startsWith('Soporte IT') ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'}`}>
                {ia ? <Sparkles className="h-3.5 w-3.5" /> : iniciales(m.autor)}
              </span>
              <div className={`flex max-w-[80%] flex-col gap-1 ${mio ? 'items-end' : ''}`}>
                <span className="text-[11px] text-gray-500">{mio ? 'Tú' : m.autor} · {cuando(m.creadoEn)}</span>
                <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  mio ? 'rounded-tr-sm bg-zero-600 text-white'
                    : ia ? 'rounded-tl-sm border border-violet-200 bg-violet-50 text-violet-950'
                    : 'rounded-tl-sm border border-gray-200 bg-white text-gray-900'}`}>
                  {m.texto}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {puedeGestionar && (
        <div className="space-y-2 border-t border-gray-100 bg-white px-5 py-3">
          <label className="sr-only" htmlFor={`responder-${tarea.id}`}>Responder</label>
          <textarea id={`responder-${tarea.id}`} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void enviar(); }}
            placeholder="Escribe una respuesta…"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void marcar()} disabled={enviando}
              title={tarea.estado === 'abierta' ? 'Ya se resolvió: sale de las abiertas y queda en el historial' : 'Vuelve a las abiertas'}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${
                tarea.estado === 'abierta' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
              <Check className="h-4 w-4" />{tarea.estado === 'abierta' ? 'Marcar como completada' : 'Volver a abrir'}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => void enviar()} disabled={enviando || !texto.trim()}
              className="h-9 rounded-lg bg-zero-600 px-4 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function NuevaTarea({ estudianteId, nombre, familiaPosible, onCreada }: {
  estudianteId: number; nombre: string; familiaPosible: boolean; onCreada: (id: number) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [alcance, setAlcance] = useState<'alumno' | 'familia'>('alumno');
  const [asignadaA, setAsignadaA] = useState<Asignacion>('direccion');
  const [persona, setPersona] = useState('');
  const [venceEl, setVenceEl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { data: dataPersonas } = useSWR<{ personas: { id: number; nombre: string }[] }>(
    asignadaA === 'persona' ? '/api/administracion-escolar/tareas/personas' : null, traer);

  const opciones: { id: Asignacion; texto: string; detalle: string }[] = [
    { id: 'direccion', texto: ETIQUETA_ASIGNACION.direccion, detalle: 'La directora' },
    { id: 'administracion', texto: ETIQUETA_ASIGNACION.administracion, detalle: 'Cobros y caja' },
    { id: 'soporte', texto: 'Soporte IT', detalle: 'El equipo de Zero' },
    { id: 'persona', texto: 'Una persona', detalle: 'Del colegio' },
  ];

  async function crear() {
    setGuardando(true);
    try {
      const res = await fetch('/api/administracion-escolar/tareas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudianteId, alcance, titulo, descripcion, asignadaA,
          asignadaUserId: asignadaA === 'persona' ? Number(persona) || null : null,
          venceEl: venceEl || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo crear');
      toast.success('Tarea creada');
      onCreada(d.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear');
    } finally { setGuardando(false); }
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Qué hay que revisar *</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} autoFocus
            placeholder="Ej.: Decidir qué hacer con RD$3,000 de pago de más"
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Detalle</span>
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Lo que se sabe y lo que hay que decidir. Queda como el primer mensaje de la conversación."
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
        </label>
        {familiaPosible && (
          <div className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-700">De quién es</span>
            <div><Segmento etiqueta="De quién es" valor={alcance} onCambio={setAlcance}
              opciones={[{ id: 'alumno', texto: nombre }, { id: 'familia', texto: 'Toda la familia' }]} /></div>
          </div>
        )}
        <div className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Asignar a</span>
          <div className="grid grid-cols-2 gap-2">
            {opciones.map((o) => (
              <button key={o.id} type="button" aria-pressed={asignadaA === o.id} onClick={() => setAsignadaA(o.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  asignadaA === o.id ? 'border-zero-500 bg-zero-50 ring-1 ring-zero-500' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <span className="block text-sm font-semibold text-gray-900">{o.texto}</span>
                <span className="block text-xs text-gray-500">{o.detalle}</span>
              </button>
            ))}
          </div>
          {asignadaA === 'persona' && (
            <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Persona"
              className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-zero-500 focus:outline-none">
              <option value="">Elegir a la persona…</option>
              {(dataPersonas?.personas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Para cuándo</span>
          <input type="date" value={venceEl} onChange={(e) => setVenceEl(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-zero-500 focus:outline-none" />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={() => void crear()}
          disabled={guardando || !titulo.trim() || (asignadaA === 'persona' && !persona)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-zero-600 px-4 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}Crear tarea
        </button>
      </div>
    </>
  );
}
