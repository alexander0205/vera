'use client';

import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import Drawer from '@mui/material/Drawer';
import {
  ArrowLeft, Bell, Check, Clock, Download, ExternalLink, FileText, HandHelping, Loader2, MessageSquareText, Paperclip, Plus, RotateCcw,
  ScanSearch, Sparkles, TriangleAlert, Users, Wrench, X,
} from 'lucide-react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { toast } from 'sonner';
import {
  ACEPTA_ADJUNTOS, archivosDelPegado, claseDeMime, DE_COLEGIO, ETIQUETA_ESTADO, HORAS_ALERTA, MODOS_REDACCION, nombreDePegado,
  debeTomar, pasaElTurno, PLANTILLAS_SOPORTE, validarAdjunto,
  type AccionEstado, type Asignacion, type EstadoTarea, type Lado, type ModoRedaccion, type PlantillaSoporte,
} from '@/lib/administracion-escolar/tareas-reglas';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { autorAMostrar, etiquetaAtiende, inicialesDe, type PersonaEquipo } from '@/lib/administracion-escolar/tareas-equipo';
import { AvatarEquipo } from './AvatarEquipo';
import { MenuMenciones, TextoConMenciones, useMencionesCaja } from './MencionesTarea';
import { textoPlano } from '@/lib/administracion-escolar/tareas-menciones';

/**
 * Las tareas por revisar de un alumno y de su familia, desde su ficha.
 *
 * Dos botones con su número —el del alumno y el de la familia— abren un panel
 * a la derecha. Ahí está la lista (abiertas o el historial), y cada tarea se
 * lleva como una conversación: lo que se dijo, quién la creó, quién la marcó
 * como completada. Las tareas las crea una persona del colegio, el equipo de
 * Zero (firma «Soporte IT · Zero») o Zero AI. El formulario de una tarea nueva
 * también lo usa «Tareas», donde la tarea puede ser del colegio.
 *
 * Una tarea puede quedar «En revisión» (alguien ya la tomó; sigue pendiente), y
 * en la conversación se suben fotos, videos y documentos con el clip o pegándolos
 * con Ctrl+V. El equipo de Zero tiene además un corrector con IA.
 */

interface Conteo { alumno: number; familia: number }
interface TareaEnLista {
  id: number; titulo: string; estado: EstadoTarea; de: string; asignada: string;
  documento: string | null; creadaPorIa: boolean; venceEl: string | null;
  ultimo: { autor: string; texto: string; tipo: string; creadoEn: string } | null;
  mensajes: number; actualizadoEn: string; turno: Turno | null;
  /** La persona del equipo de Zero que la atiende. */
  atiende?: PersonaEquipo | null;
}
/** A quién le toca contestar y desde cuándo (ver `turnoDe`). */
export interface Turno { quien: 'soporte' | 'colegio'; nombre: string | null; desde: string; cierraEn: string | null }
interface DocumentoFamilia { id: number; codigo: string; tipoEcf: string; fecha: string | null; montoTotal: number; anulado: boolean }
interface Mensaje {
  id: number; tipo: 'mensaje' | 'evento' | 'ia' | 'adjunto'; userId: number | null; autor: string; texto: string; creadoEn: string;
  /** La persona del equipo de Zero que lo escribió; sin ella, la firma genérica. */
  equipo?: PersonaEquipo | null;
  /** Solo en los de tipo «adjunto», cuando el archivo ya subió entero. */
  adjunto: { id: number; mime: string; bytes: number } | null;
}
/** Quién tomó la tarea por cada lado (primer nombre). */
export type TomadaPor = Record<Lado, { userId: number; nombre: string } | null>;
export interface TareaCompleta {
  id: number; titulo: string; estado: EstadoTarea; de: string; fichaId: number | null; asignada: string;
  /** 'soporte' | 'persona'. */
  asignadaA?: string;
  /** A quién le toca contestar (guardado); `null` en una completada. */
  espera?: Lado | null;
  pausaHasta?: string | null;
  tomadaPor?: TomadaPor;
  documento: string | null; ecfDocumentId: number | null; creadaPorIa: boolean; venceEl: string | null; mensajes: Mensaje[];
  turno: Turno | null;
  atiende?: PersonaEquipo | null;
}

type Vista = { tipo: 'lista' } | { tipo: 'hilo'; id: number } | { tipo: 'nueva' };

export const traer = (url: string) => fetch(url).then(async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'No se pudo cargar');
  return d;
});

/** «hoy 9:40», «ayer 16:20» o «12 oct». */
export function cuando(iso: string) {
  const f = new Date(iso);
  const hoy = new Date();
  const hora = f.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' });
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (dia(f) === dia(hoy)) return `hoy ${hora}`;
  if (dia(f) === dia(ayer)) return `ayer ${hora}`;
  return f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' });
}

const iniciales = inicialesDe;

/** «La atiende: Ana · Soporte técnico» con su foto o iniciales; nada si no se sabe quién. */
export function QuienAtiende({ persona, chica = false }: { persona: PersonaEquipo | null | undefined; chica?: boolean }) {
  if (!persona) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-1.5 py-0.5 font-medium text-violet-900">
      <AvatarEquipo fotoUrl={persona.fotoUrl} iniciales={inicialesDe(persona.nombre)} clase={chica ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]'} />
      La atiende: {etiquetaAtiende(persona)}
    </span>
  );
}

export const COLOR_PUNTO: Record<EstadoTarea, string> = {
  abierta: 'bg-amber-500', en_proceso: 'bg-violet-500', en_revision: 'bg-sky-500', completada: 'bg-emerald-600',
};
export const COLOR_CHIP: Record<EstadoTarea, string> = {
  abierta: 'bg-amber-50 text-amber-800', en_proceso: 'bg-violet-50 text-violet-800', en_revision: 'bg-sky-50 text-sky-800', completada: 'bg-emerald-50 text-emerald-800',
};

const pesoLegible = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Sube un archivo a una tarea: abre la subida y manda los trozos en orden
 * (una función de Vercel no recibe más de 4.5 MB de una vez; un video sí pesa
 * más). `onAvance` recibe de 0 a 1.
 */
export async function subirAdjunto(tareaId: number, archivo: File, onAvance?: (fraccion: number) => void) {
  const v = validarAdjunto({ nombre: archivo.name, bytes: archivo.size });
  if (!v.ok) throw new Error(v.error);
  const base = `/api/administracion-escolar/tareas/${tareaId}/adjuntos`;
  const res = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: archivo.name, bytes: archivo.size }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? 'No se pudo subir el archivo');
  const { adjuntoId, trozo } = d as { adjuntoId: number; trozo: number };
  const total = Math.ceil(archivo.size / trozo);
  for (let n = 0; n < total; n++) {
    const fin = n === total - 1;
    const r = await fetch(`${base}/${adjuntoId}?n=${n}${fin ? '&fin=1' : ''}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
      body: archivo.slice(n * trozo, (n + 1) * trozo),
    });
    const e = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(e.error ?? `No se pudo subir «${archivo.name}»`);
    onAvance?.((n + 1) / total);
  }
}

/**
 * Los archivos que trae un Ctrl+V, ya con nombre. Si es texto devuelve nada y
 * lo pega el navegador como siempre.
 */
function archivosDePegado(e: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const d = e.clipboardData;
  const archivos = archivosDelPegado({ archivos: [...d.files], texto: d.getData('text/plain'), html: d.getData('text/html') });
  if (archivos.length === 0) return [];
  e.preventDefault();
  const ahora = new Date();
  return archivos.map((f, i) => new File([f], nombreDePegado(f.name, f.type, ahora, i), { type: f.type }));
}

/** Los que se pueden subir; de los demás se dice por qué no. */
function soloValidos(archivos: File[]): File[] {
  return archivos.filter((f) => {
    const v = validarAdjunto({ nombre: f.name, bytes: f.size });
    if (!v.ok) toast.error(v.error);
    return v.ok;
  });
}

/** La foto en pequeño o, si no es foto, un clip. */
function Miniatura({ archivo }: { archivo: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!archivo.type.startsWith('image/') || archivo.type.includes('hei')) return;
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  // eslint-disable-next-line @next/next/no-img-element -- es un blob del navegador, next/image no aplica
  if (url) return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />;
  return <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-500" />;
}

/** Lo que está listo para salir: se ve antes de enviarlo y se puede quitar. */
function ArchivosPorEnviar({ archivos, onQuitar }: { archivos: File[]; onQuitar: (i: number) => void }) {
  if (archivos.length === 0) return null;
  return (
    <ul className="space-y-1">
      {archivos.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm">
          <Miniatura archivo={f} />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="shrink-0 text-xs text-gray-500">{pesoLegible(f.size)}</span>
          <button type="button" onClick={() => onQuitar(i)}
            aria-label={`Quitar ${f.name}`} className="rounded p-0.5 text-gray-500 hover:bg-gray-200"><X className="h-3.5 w-3.5" /></button>
        </li>
      ))}
    </ul>
  );
}

/** «menos de 1 h», «5 h», «3 días». */
function espera(desde: string, ahora = Date.now()) {
  const horas = Math.floor((ahora - new Date(desde).getTime()) / 3_600_000);
  if (horas < 1) return { texto: 'menos de 1 h', horas };
  if (horas < 48) return { texto: `${horas} h`, horas };
  return { texto: `${Math.floor(horas / 24)} días`, horas };
}

/**
 * «Espera respuesta de Zero · 3 h» o «Espera respuesta del colegio · Lizandro ·
 * 26 h»: a quién le toca contestar y cuánto lleva esperando. En rojo pasadas
 * las HORAS_ALERTA horas, que es cuando sale el aviso urgente.
 */
export function TurnoChip({ turno }: { turno: Turno | null }) {
  if (!turno) return null;
  const e = espera(turno.desde);
  const tarde = e.horas >= HORAS_ALERTA;
  const quien = turno.quien === 'soporte' ? 'Espera respuesta de Zero' : `Espera respuesta del colegio${turno.nombre ? ` · ${turno.nombre}` : ''}`;
  const color = tarde ? 'bg-red-50 text-red-800 ring-red-200'
    : turno.quien === 'soporte' ? 'bg-violet-50 text-violet-800 ring-violet-200' : 'bg-amber-50 text-amber-900 ring-amber-200';
  const cierra = turno.cierraEn
    ? ` · se cierra sola ${new Date(turno.cierraEn).toLocaleString('es-DO', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' })}`
    : '';
  return (
    <span title={tarde ? `Más de ${HORAS_ALERTA} horas sin respuesta: ya salió el aviso urgente` : 'A quién le toca contestar y cuánto lleva esperando'}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${color}`}>
      {quien} · {e.texto}{cierra}
    </span>
  );
}

export const Segmento = <T extends string>({ opciones, valor, onCambio, etiqueta }: {
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
  const { data: dataHilo, mutate: mutarHilo } = useSWR<{ tarea: TareaCompleta; yo: number; soporte?: boolean }>(claveHilo, traer);

  const abrir = (a: 'alumno' | 'familia') => {
    setAlcance(a); setEstado('abierta'); setVista({ tipo: 'lista' }); setAbierto(true);
  };
  const refrescar = () => { void mutarConteo(); void mutarLista(); void mutarHilo(); };

  const titulo = vista.tipo === 'hilo' ? (dataHilo?.tarea.titulo ?? 'Tarea')
    : vista.tipo === 'nueva' ? 'Nueva tarea' : 'Tareas por revisar';
  const subtitulo = vista.tipo === 'hilo' ? 'La conversación de esta tarea'
    : vista.tipo === 'nueva' ? 'Algo que alguien tiene que decidir o arreglar'
    : alcance === 'alumno' ? `De ${nombre} · ${conteo.alumno} pendiente(s)`
    : `De toda la familia · ${conteo.familia} pendiente(s)`;

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
                  opciones={[{ id: 'abierta', texto: 'Pendientes' }, { id: 'completada', texto: 'Historial' }]} />
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
                    {estado === 'abierta' ? 'No hay tareas pendientes.' : 'Todavía no hay tareas completadas.'}
                  </p>
                )}
                {(dataLista?.tareas ?? []).map((t) => (
                  <button key={t.id} type="button" onClick={() => setVista({ tipo: 'hilo', id: t.id })}
                    className="flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-gray-50">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_PUNTO[t.estado]}`} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-gray-500">{cuando(t.ultimo?.creadoEn ?? t.actualizadoEn)}</span>
                      </span>
                      {t.ultimo && (
                        <span className="block truncate text-xs text-gray-600">
                          {t.ultimo.tipo !== 'evento' && <strong className="font-semibold text-gray-700">{t.ultimo.autor}: </strong>}
                          {t.ultimo.tipo === 'adjunto' && '📎 '}{textoPlano(t.ultimo.texto)}
                        </span>
                      )}
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                        {t.de} · {t.asignada}
                        <QuienAtiende persona={t.atiende} chica />
                        {t.estado === 'en_proceso' && <span className="rounded bg-violet-50 px-1.5 font-semibold text-violet-800">En proceso</span>}
                        {t.estado === 'en_revision' && <span className="rounded bg-sky-50 px-1.5 font-semibold text-sky-800">En revisión</span>}
                        <TurnoChip turno={t.turno} />
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
              ? <Hilo tarea={dataHilo.tarea} yo={dataHilo.yo} soporte={dataHilo.soporte} puedeGestionar={puedeGestionar} onCambio={refrescar} />
              : <div className="flex flex-1 justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
          )}

          {vista.tipo === 'nueva' && (
            <NuevaTarea alumnoFijo={{ id: estudianteId, nombre, familiaPosible: dataLista?.familia.tieneResponsable ?? true }}
              onCreada={(id) => { refrescar(); setVista({ tipo: 'hilo', id }); }} />
          )}
        </div>
      </Drawer>
    </>
  );
}

export function CabeceraHilo({ tarea }: { tarea: TareaCompleta }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className={`rounded-md px-2 py-0.5 font-semibold ${COLOR_CHIP[tarea.estado]}`}>
        {ETIQUETA_ESTADO[tarea.estado]}
      </span>
      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">{tarea.de}</span>
      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">Asignada a {tarea.asignada}</span>
      {tarea.documento && tarea.ecfDocumentId && (
        <a href={`/dashboard/facturas/${tarea.ecfDocumentId}`} className="rounded-md bg-zero-50 px-2 py-0.5 font-mono font-semibold text-zero-700 hover:underline">
          {tarea.documento}
        </a>
      )}
      {tarea.venceEl && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">Para el {tarea.venceEl.split('-').reverse().join('/')}</span>}
      <TurnoChip turno={tarea.turno} />
      <QuienAtiende persona={tarea.atiende} />
      {tarea.tomadaPor?.colegio && (
        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-900">La tomó {tarea.tomadaPor.colegio.nombre} (colegio)</span>
      )}
      {tarea.tomadaPor?.zero && !tarea.atiende && (
        <span className="rounded-md bg-violet-50 px-2 py-0.5 text-violet-800">La tomó {tarea.tomadaPor.zero.nombre} (Zero)</span>
      )}
      {tarea.pausaHasta && new Date(tarea.pausaHasta).getTime() > Date.now() && (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-sky-800">
          <Clock className="h-3 w-3" />Sin alertas hasta {new Date(tarea.pausaHasta).toLocaleString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' })}
        </span>
      )}
    </div>
  );
}

const SEGUNDOS_PARA_CANCELAR = 5;

export function Hilo({ tarea, yo, soporte = false, puedeGestionar, onCambio }: {
  tarea: TareaCompleta; yo: number;
  /** Quien mira es del equipo de Zero: ve las plantillas de Soporte IT. */
  soporte?: boolean;
  puedeGestionar: boolean; onCambio: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Con una plantilla elegida, «Enviar» manda el texto (editable) y cambia el estado.
  const [plantilla, setPlantilla] = useState<PlantillaSoporte | null>(null);
  const [menuPlantillas, setMenuPlantillas] = useState<HTMLElement | null>(null);
  const [subiendo, setSubiendo] = useState<{ nombre: string; avance: number } | null>(null);
  // Lo elegido con el clip o pegado: se ve antes de enviarlo, porque un Ctrl+V sin querer no se puede borrar después.
  const [porEnviar, setPorEnviar] = useState<File[]>([]);
  // El corrector no envía nada: pone su texto en la caja y aquí queda el anterior para deshacer.
  const [menuCorrector, setMenuCorrector] = useState<HTMLElement | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [textoAnterior, setTextoAnterior] = useState<string | null>(null);
  const elegir = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Enviar: primero la revisión del tono (solo el equipo de Zero), luego 5 s para arrepentirse si el mensaje le pasa la tarea al otro lado.
  const [revisandoTono, setRevisandoTono] = useState(false);
  const [tono, setTono] = useState<{ motivo: string; sugerencia: string } | null>(null);
  const [cuenta, setCuenta] = useState<{ restante: number; texto: string } | null>(null);
  const [tomando, setTomando] = useState(false);
  // «Esto tomará más tiempo»: pide para cuándo.
  const [pidiendoFecha, setPidiendoFecha] = useState(false);
  const [fechaEstimada, setFechaEstimada] = useState('');

  // El menú de «@»: personas, padres, estudiantes, facturas y notas.
  const menciones = useMencionesCaja({ tareaId: tarea.id, texto, setTexto, areaRef, activo: puedeGestionar && !plantilla });

  // Mi lado, a quién le toca y si nadie de mi lado la ha tomado.
  const miLado: Lado = soporte ? 'zero' : 'colegio';
  const tomo = tarea.tomadaPor?.[miLado] ?? null;
  const necesitaTomar = debeTomar(tarea, miLado);
  const loTomeYo = tomo != null && tomo.userId === yo;
  const meToca = tarea.espera === miLado && tarea.estado !== 'completada';
  const pasaria = pasaElTurno({ asignadaA: tarea.asignadaA ?? 'persona', estado: tarea.estado, espera: tarea.espera ?? null, lado: miLado });
  const etiquetaDestino = miLado === 'zero' ? 'Respuesta del colegio' : 'Respuesta de Zero';

  // La cuenta atrás de 5 s: al llegar a 0 se envía y la tarea pasa.
  useEffect(() => {
    if (!cuenta) return;
    if (cuenta.restante <= 0) { const t = cuenta.texto; setCuenta(null); void enviarAhora(true, t); return; }
    const t = setTimeout(() => setCuenta({ ...cuenta, restante: cuenta.restante - 1 }), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta]);

  async function tomar() {
    setTomando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}/tomar`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo tomar la tarea');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo tomar la tarea');
      onCambio();
    } finally { setTomando(false); }
  }

  async function seguimiento(tipo: 'sigo' | 'mas_tiempo') {
    setEnviando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}/seguimiento`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tipo === 'sigo' ? { tipo } : { tipo, hasta: new Date(fechaEstimada).toISOString() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo enviar');
      setPidiendoFecha(false);
      setFechaEstimada('');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally { setEnviando(false); }
  }

  async function corregir(modo: ModoRedaccion) {
    setMenuCorrector(null);
    setCorrigiendo(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}/redactar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo, texto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo mejorar el texto');
      setTextoAnterior(texto);
      setTexto(d.texto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo mejorar el texto');
    } finally { setCorrigiendo(false); }
  }

  async function usarPlantilla(p: PlantillaSoporte) {
    setMenuPlantillas(null);
    try {
      const d = await traer(`/api/administracion-escolar/tareas/${tarea.id}/plantilla?plantilla=${p}`);
      setTexto(d.texto);
      setPlantilla(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo preparar la plantilla');
    }
  }

  /** Pulsar «Enviar»: revisa el tono (equipo de Zero) y, si el mensaje pasa la tarea al otro lado, abre los 5 s. Nada se escribe aún. */
  async function enviar() {
    if (ocupado || !hayQueEnviar) return;
    // Una plantilla cambia el estado enseguida (completar o revisión): no hay turno que pasar con el mensaje.
    if (plantilla || !texto.trim()) return void enviarAhora(false, texto);
    if (soporte) {
      setRevisandoTono(true);
      const r = await revisarTono(texto);
      setRevisandoTono(false);
      if (r) { setTono(r); return; }
    }
    seguirConEnvio(texto);
  }

  /** Después del tono: con turno que pasar, 5 s; si no, sale ya. */
  function seguirConEnvio(t: string) {
    if (pasaria) setCuenta({ restante: SEGUNDOS_PARA_CANCELAR, texto: t });
    else void enviarAhora(false, t);
  }

  /** La revisión nunca bloquea: con 3,5 s, error o sin riesgo, se envía normal (`null`). */
  async function revisarTono(t: string): Promise<{ motivo: string; sugerencia: string } | null> {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 3500);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}/tono`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: t }), signal: ctrl.signal,
      });
      const d = await res.json().catch(() => null) as { riesgo?: boolean; motivo?: string; sugerencia?: string } | null;
      return res.ok && d?.riesgo && d.motivo && d.sugerencia ? { motivo: d.motivo, sugerencia: d.sugerencia } : null;
    } catch { return null; } finally { clearTimeout(reloj); }
  }

  /** El envío de verdad. `pasar`: el mensaje le pasa la tarea al otro lado. */
  async function enviarAhora(pasar: boolean, t: string) {
    setEnviando(true);
    try {
      if (t.trim()) {
        const res = plantilla
          ? await fetch(`/api/administracion-escolar/tareas/${tarea.id}/plantilla`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plantilla, texto: t }),
          })
          : await fetch(`/api/administracion-escolar/tareas/${tarea.id}/mensajes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: menciones.tokenizar(t), pasarTurno: pasar }),
          });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? 'No se pudo enviar');
        if (plantilla) toast.success('Enviado: le llega por correo y en la campana');
        setTexto('');
        menciones.reiniciar();
        setTextoAnterior(null);
        setPlantilla(null);
        setTono(null);
        onCambio();
      }
      await subirPorEnviar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally { setEnviando(false); }
  }

  async function marcar(accion: AccionEstado) {
    setEnviando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${tarea.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cambiar');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally { setEnviando(false); }
  }

  /** Sube lo que está en espera. El que falla se queda ahí para reintentarlo. */
  async function subirPorEnviar() {
    for (const archivo of porEnviar) {
      setSubiendo({ nombre: archivo.name, avance: 0 });
      try {
        await subirAdjunto(tarea.id, archivo, (avance) => setSubiendo({ nombre: archivo.name, avance }));
        setPorEnviar((a) => a.filter((f) => f !== archivo));
        onCambio();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `No se pudo subir «${archivo.name}»`);
      }
    }
    setSubiendo(null);
  }

  const agregar = (archivos: File[]) => setPorEnviar((a) => [...a, ...soloValidos(archivos)]);

  const ocupado = enviando || subiendo != null || corrigiendo || revisandoTono || cuenta != null || tono != null;
  const hayQueEnviar = Boolean(texto.trim()) || porEnviar.length > 0;

  return (
    <>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-gray-50/60 px-5 py-4">
        {tarea.mensajes.map((m) => {
          if (m.tipo === 'evento') {
            const color = m.texto.includes('completada') ? 'bg-emerald-50 text-emerald-800'
              : m.texto.includes('revisión') ? 'bg-sky-50 text-sky-800' : 'bg-gray-100 text-gray-600';
            return (
              <p key={m.id} className={`self-center rounded-full px-3 py-1 text-center text-[11px] font-medium ${color}`}>
                {m.texto} · {cuando(m.creadoEn)}
              </p>
            );
          }
          const mio = m.userId === yo && (m.tipo === 'mensaje' || m.tipo === 'adjunto');
          const ia = m.tipo === 'ia';
          const quien = autorAMostrar(m);
          return (
            <div key={m.id} className={`flex items-start gap-2 ${mio ? 'flex-row-reverse' : ''}`}>
              {quien.esPersona && !mio ? (
                <AvatarEquipo fotoUrl={quien.fotoUrl} iniciales={quien.iniciales} />
              ) : (
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  mio ? 'bg-zero-600 text-white' : ia ? 'bg-violet-600 text-white' : (m.autor.startsWith('Soporte IT') || m.autor.startsWith('Departamento de IT')) ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'}`}>
                  {ia ? <Sparkles className="h-3.5 w-3.5" /> : iniciales(m.autor)}
                </span>
              )}
              <div className={`flex max-w-[80%] flex-col gap-1 ${mio ? 'items-end' : ''}`}>
                <span className="text-[11px] text-gray-500">{mio ? 'Tú' : quien.etiqueta} · {cuando(m.creadoEn)}</span>
                {m.tipo === 'adjunto' ? (
                  <Adjunto tareaId={tarea.id} nombre={m.texto} adjunto={m.adjunto} />
                ) : (
                  <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    mio ? 'rounded-tr-sm bg-zero-600 text-white'
                      : ia ? 'rounded-tl-sm border border-violet-200 bg-violet-50 text-violet-950'
                      : 'rounded-tl-sm border border-gray-200 bg-white text-gray-900'}`}>
                    <TextoConMenciones texto={m.texto} sobreOscuro={mio} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {puedeGestionar && (
        <div className="space-y-2 border-t border-gray-100 bg-white px-5 py-3">
          {necesitaTomar && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zero-200 bg-zero-50 px-3 py-2.5 text-sm text-zero-900">
              <HandHelping className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                {miLado === 'zero' ? 'Nadie del equipo de Zero ha tomado esta tarea.' : 'Nadie del colegio ha tomado esta tarea.'} Tómala para poder responder.
              </span>
              <button type="button" onClick={() => void tomar()} disabled={tomando}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zero-600 px-3 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
                {tomando ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHelping className="h-4 w-4" />}Tomar la tarea
              </button>
            </div>
          )}
          {!necesitaTomar && loTomeYo && meToca && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Te toca contestar:</span>
                <button type="button" onClick={() => void seguimiento('sigo')} disabled={ocupado}
                  title="Le escribe al otro lado que sigues con esto y reinicia el reloj de la alerta"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <Wrench className="h-3.5 w-3.5" />Sigo trabajando en ello
                </button>
                <button type="button" onClick={() => setPidiendoFecha((v) => !v)} disabled={ocupado} aria-expanded={pidiendoFecha}
                  title="Le dice al otro lado para cuándo estará y no hay alertas hasta entonces"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <Clock className="h-3.5 w-3.5" />Esto tomará más tiempo
                </button>
              </div>
              {pidiendoFecha && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <label htmlFor={`estimada-${tarea.id}`}>¿Para cuándo estará?</label>
                  <input id={`estimada-${tarea.id}`} type="datetime-local" value={fechaEstimada} onChange={(e) => setFechaEstimada(e.target.value)}
                    className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs focus:border-zero-500 focus:outline-none" />
                  <button type="button" onClick={() => void seguimiento('mas_tiempo')} disabled={ocupado || !fechaEstimada}
                    className="h-8 rounded-md bg-zero-600 px-3 text-xs font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
                    Avisar
                  </button>
                  <button type="button" onClick={() => setPidiendoFecha(false)} className="text-xs font-semibold text-gray-600 hover:underline">Cancelar</button>
                </div>
              )}
            </div>
          )}
          {!necesitaTomar && <label className="sr-only" htmlFor={`responder-${tarea.id}`}>Responder</label>}
          {tono && (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span><span className="font-semibold">Revisa el tono antes de enviar.</span> {tono.motivo}</span>
              </p>
              <p className="whitespace-pre-wrap rounded-md bg-white/70 px-2.5 py-1.5 text-xs text-amber-900">
                <span className="font-semibold">Sugerencia: </span>{tono.sugerencia}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { const t = tono.sugerencia; setTexto(t); setTextoAnterior(texto); setTono(null); seguirConEnvio(t); }}
                  className="h-8 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700">Usar sugerencia</button>
                <button type="button" onClick={() => { setTono(null); document.getElementById(`responder-${tarea.id}`)?.focus(); }}
                  className="h-8 rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100">Editar</button>
                <button type="button" onClick={() => { setTono(null); seguirConEnvio(texto); }}
                  className="h-8 rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100">Enviar igual</button>
              </div>
            </div>
          )}
          {cuenta && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
              <span className="min-w-0 flex-1">
                Enviando… pasará a <span className="font-semibold">{etiquetaDestino}</span>
                <span className="ml-1 tabular-nums text-sky-700">({cuenta.restante} s)</span>
              </span>
              <button type="button" onClick={() => setCuenta(null)}
                className="h-8 rounded-md border border-sky-400 bg-white px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100">Cancelar</button>
              <button type="button" onClick={() => { const t = cuenta.texto; setCuenta(null); void enviarAhora(false, t); }}
                className="h-8 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700">Enviar sin pasar</button>
            </div>
          )}
          {!necesitaTomar && plantilla && (
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                Plantilla «{PLANTILLAS_SOPORTE[plantilla].etiqueta}»: revisa el texto. Le llega a quien la creó y a los dueños del colegio.
              </span>
              <button type="button" onClick={() => { setPlantilla(null); setTexto(''); }}
                className="font-semibold hover:underline">Quitar</button>
            </div>
          )}
          {!necesitaTomar && cuenta == null && textoAnterior != null && (
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">Lo reescribió la IA: revísalo antes de enviarlo.</span>
              <button type="button" onClick={() => { setTexto(textoAnterior); setTextoAnterior(null); }}
                className="font-semibold hover:underline">Deshacer</button>
            </div>
          )}
          {!necesitaTomar && (
            <div className="relative">
              <MenuMenciones m={menciones} />
              <textarea id={`responder-${tarea.id}`} ref={areaRef} rows={plantilla || textoAnterior != null ? 5 : 2} value={texto}
                onChange={(e) => menciones.alEscribir(e.target.value, e.target.selectionStart)}
                onSelect={(e) => menciones.alMoverCursor(e.currentTarget.selectionStart)}
                onKeyDown={(e) => {
                  if (menciones.onTecla(e)) return;
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void enviar();
                }}
                onPaste={(e) => agregar(archivosDePegado(e))}
                readOnly={corrigiendo || cuenta != null || revisandoTono}
                role="combobox" aria-expanded={menciones.abierto} aria-haspopup="listbox" aria-autocomplete="list"
                placeholder="Escribe una respuesta, escribe @ para mencionar, o pega una captura o un archivo…"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
            </div>
          )}
          {!necesitaTomar && <ArchivosPorEnviar archivos={porEnviar} onQuitar={(i) => setPorEnviar((a) => a.filter((_, j) => j !== i))} />}
          {subiendo && (
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zero-600" />
              <span className="min-w-0 flex-1 truncate">Subiendo {subiendo.nombre}</span>
              <span className="tabular-nums">{Math.round(subiendo.avance * 100)}%</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {tarea.estado !== 'completada' && (
              <button type="button" onClick={() => void marcar('completar')} disabled={ocupado}
                title="Ya se resolvió: sale de las pendientes y queda en el historial"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                <Check className="h-4 w-4" />Completar
              </button>
            )}
            {(tarea.estado === 'abierta' || tarea.estado === 'en_revision') && (
              <button type="button" onClick={() => void marcar('tomar')} disabled={ocupado}
                title="Ya la estamos trabajando: quien la pidió ve que alguien la tomó"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50">
                <Wrench className="h-4 w-4" />En proceso
              </button>
            )}
            {(tarea.estado === 'abierta' || tarea.estado === 'en_proceso') && (
              <button type="button" onClick={() => void marcar('revision')} disabled={ocupado}
                title="Ya se hizo y falta que la confirmen: sigue pendiente"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
                <ScanSearch className="h-4 w-4" />En revisión
              </button>
            )}
            {tarea.estado !== 'abierta' && (
              <button type="button" onClick={() => void marcar('reabrir')} disabled={ocupado}
                title="Vuelve a las abiertas"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <RotateCcw className="h-4 w-4" />{tarea.estado === 'completada' ? 'Volver a abrir' : tarea.estado === 'en_proceso' ? 'Soltar tarea' : 'Quitar de revisión'}
              </button>
            )}
            <span className="flex-1" />
            {soporte && !necesitaTomar && (
              <>
                <button type="button" onClick={(e) => setMenuPlantillas(e.currentTarget)} disabled={ocupado}
                  title="Plantillas del Departamento de IT (solo el equipo de Zero)"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50">
                  <MessageSquareText className="h-4 w-4" />Plantilla
                </button>
                <Menu anchorEl={menuPlantillas} open={Boolean(menuPlantillas)} onClose={() => setMenuPlantillas(null)}
                  anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                  {(Object.keys(PLANTILLAS_SOPORTE) as PlantillaSoporte[]).map((p) => (
                    <MenuItem key={p} onClick={() => void usarPlantilla(p)}>
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900">{PLANTILLAS_SOPORTE[p].etiqueta}</span>
                        <span className="text-xs text-gray-500">{PLANTILLAS_SOPORTE[p].detalle}</span>
                      </span>
                    </MenuItem>
                  ))}
                </Menu>
                <button type="button" onClick={(e) => setMenuCorrector(e.currentTarget)} disabled={ocupado}
                  title="Corrige o mejora el texto con IA, sin enviarlo (solo el equipo de Zero)"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50">
                  {corrigiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Corrector
                </button>
                <Menu anchorEl={menuCorrector} open={Boolean(menuCorrector)} onClose={() => setMenuCorrector(null)}
                  anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                  {(Object.keys(MODOS_REDACCION) as ModoRedaccion[]).map((m) => (
                    <MenuItem key={m} disabled={MODOS_REDACCION[m].necesitaTexto && !texto.trim()} onClick={() => void corregir(m)}>
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900">{MODOS_REDACCION[m].etiqueta}</span>
                        <span className="text-xs text-gray-500">{MODOS_REDACCION[m].detalle}</span>
                      </span>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
            {!necesitaTomar && (
              <>
                <input ref={elegir} type="file" multiple accept={ACEPTA_ADJUNTOS} className="hidden"
                  onChange={(e) => { agregar([...(e.target.files ?? [])]); e.target.value = ''; }} />
                <button type="button" onClick={() => elegir.current?.click()} disabled={ocupado}
                  aria-label="Adjuntar fotos, videos o documentos" title="Adjuntar fotos, videos o documentos"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void enviar()} disabled={ocupado || !hayQueEnviar}
                  className="h-9 rounded-lg bg-zero-600 px-4 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
                  {revisandoTono ? 'Revisando el tono…' : plantilla ? PLANTILLAS_SOPORTE[plantilla].boton : 'Enviar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Un archivo de la conversación: la foto o el video se ven ahí mismo; un documento, como ficha. */
function Adjunto({ tareaId, nombre, adjunto }: {
  tareaId: number; nombre: string; adjunto: Mensaje['adjunto'];
}) {
  if (!adjunto) {
    return <div className="rounded-2xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">📎 {nombre} (no disponible)</div>;
  }
  const url = `/api/administracion-escolar/tareas/${tareaId}/adjuntos/${adjunto.id}`;
  const clase = claseDeMime(adjunto.mime);
  // HEIC no se ve en casi ningún navegador fuera de Safari: va como documento.
  if (clase === 'imagen' && !adjunto.mime.includes('hei')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- la URL redirige a S3 firmada; next/image no la puede optimizar */}
        <img src={url} alt={nombre} loading="lazy" className="max-h-64 w-auto max-w-full object-contain" />
      </a>
    );
  }
  if (clase === 'video') {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black">
        <video src={url} controls preload="metadata" className="max-h-72 w-full max-w-sm" aria-label={nombre} />
        <a href={`${url}?descargar=1`} className="flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
          <Download className="h-3.5 w-3.5" /><span className="truncate">{nombre}</span>
        </a>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
      <FileText className="h-5 w-5 shrink-0 text-zero-600" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-gray-900">{nombre}</span>
        <span className="block text-[11px] text-gray-500">{pesoLegible(adjunto.bytes)}</span>
      </span>
    </a>
  );
}

interface AlumnoDeTarea { id: number; nombre: string; familiaPosible: boolean }

/**
 * El formulario de una tarea nueva. Desde la ficha, el alumno ya viene
 * (`alumnoFijo`). Desde «Tareas» no: la tarea puede ser del colegio, sin
 * nadie («llamar al proveedor de uniformes»), o de un alumno que se busca ahí.
 */
function NuevaTarea({ alumnoFijo, onCreada }: {
  alumnoFijo?: AlumnoDeTarea; onCreada: (id: number) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [delColegio, setDelColegio] = useState(!alumnoFijo);
  const [alumno, setAlumno] = useState<AlumnoDeTarea | null>(alumnoFijo ?? null);
  const [alcance, setAlcance] = useState<'alumno' | 'familia'>('alumno');
  const [asignadaA, setAsignadaA] = useState<Asignacion>('persona');
  const [persona, setPersona] = useState('');
  const [documento, setDocumento] = useState('');
  const [venceEl, setVenceEl] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState<string | false>(false);
  const elegir = useRef<HTMLInputElement>(null);

  function agregarArchivos(lista: File[]) {
    setArchivos((a) => [...a, ...soloValidos(lista)]);
    if (elegir.current) elegir.current.value = '';
  }
  const { data: dataPersonas } = useSWR<{ personas: { id: number; nombre: string }[] }>(
    asignadaA === 'persona' ? '/api/administracion-escolar/tareas/personas' : null, traer);
  const { data: dataDocs } = useSWR<{ documentos: DocumentoFamilia[] }>(
    !delColegio && alumno ? `/api/administracion-escolar/tareas/facturas?estudianteId=${alumno.id}` : null, traer);
  const documentos = !delColegio && alumno ? (dataDocs?.documentos ?? []) : [];

  const opciones: { id: Asignacion; texto: string; detalle: string }[] = [
    { id: 'soporte', texto: 'Departamento de IT · Zero', detalle: 'El equipo de Zero lo revisa' },
    { id: 'persona', texto: 'Una persona', detalle: 'Alguien del colegio, con nombre' },
  ];

  async function crear() {
    setGuardando('Creando…');
    try {
      const res = await fetch('/api/administracion-escolar/tareas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudianteId: delColegio ? null : alumno?.id ?? null,
          alcance: delColegio ? 'colegio' : alcance,
          titulo, descripcion, asignadaA,
          asignadaUserId: asignadaA === 'persona' ? Number(persona) || null : null,
          ecfDocumentId: delColegio ? null : Number(documento) || null,
          venceEl: venceEl || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo crear');
      // La tarea ya existe: un archivo que no sube no la deshace, se avisa y se sigue.
      for (const [i, f] of archivos.entries()) {
        setGuardando(`Subiendo ${i + 1} de ${archivos.length}…`);
        await subirAdjunto(d.id, f).catch((e: unknown) =>
          toast.error(e instanceof Error ? e.message : `No se pudo subir «${f.name}»`));
      }
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
            placeholder={delColegio ? 'Ej.: Llamar al proveedor de uniformes' : 'Ej.: Decidir qué hacer con RD$3,000 de pago de más'}
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Detalle</span>
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            onPaste={(e) => agregarArchivos(archivosDePegado(e))}
            placeholder="Lo que se sabe y lo que hay que decidir. Queda como el primer mensaje de la conversación. También puedes pegar una captura o un archivo."
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
        </label>
        {!alumnoFijo && (
          <div className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-700">De quién es</span>
            <div><Segmento etiqueta="De quién es la tarea" valor={delColegio ? 'colegio' : 'alumno'}
              onCambio={(v) => setDelColegio(v === 'colegio')}
              opciones={[{ id: 'colegio', texto: DE_COLEGIO }, { id: 'alumno', texto: 'De un alumno o su familia' }]} /></div>
            {delColegio && <span className="block text-xs text-gray-500">No es de ningún alumno: sale en «Tareas», en el grupo {DE_COLEGIO}.</span>}
            {!delColegio && (alumno
              ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{alumno.nombre}</span>
                  <button type="button" onClick={() => { setAlumno(null); setAlcance('alumno'); setDocumento(''); }}
                    className="text-xs font-medium text-zero-700 hover:underline">Cambiar</button>
                </div>
              )
              : <BuscarAlumno onElegir={setAlumno} />)}
          </div>
        )}
        {!delColegio && alumno?.familiaPosible && (
          <div className="space-y-1.5 text-sm">
            {alumnoFijo && <span className="font-medium text-gray-700">De quién es</span>}
            <div><Segmento etiqueta="Del alumno o de la familia" valor={alcance} onCambio={setAlcance}
              opciones={[{ id: 'alumno', texto: alumno.nombre.split(' ')[0] }, { id: 'familia', texto: 'Toda la familia' }]} /></div>
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
        {documentos.length > 0 && (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-gray-700">Factura relacionada</span>
            <select value={documento} onChange={(e) => setDocumento(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-zero-500 focus:outline-none">
              <option value="">Ninguna</option>
              {documentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} · {fmtFechaCorta(d.fecha)} · {fmtDOP(d.montoTotal)}{d.anulado ? ' · anulada' : ''}
                </option>
              ))}
            </select>
            <span className="block text-xs text-gray-500">Las de la familia, la más reciente primero. Queda como enlace en la tarea.</span>
          </label>
        )}
        <div className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Archivos</span>
          <ArchivosPorEnviar archivos={archivos} onQuitar={(i) => setArchivos((a) => a.filter((_, j) => j !== i))} />
          <input ref={elegir} type="file" multiple accept={ACEPTA_ADJUNTOS} className="hidden"
            onChange={(e) => agregarArchivos([...(e.target.files ?? [])])} />
          <button type="button" onClick={() => elegir.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Paperclip className="h-4 w-4" />Adjuntar fotos, videos o documentos
          </button>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-gray-700">Para cuándo</span>
          <input type="date" value={venceEl} onChange={(e) => setVenceEl(e.target.value)}
            className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-zero-500 focus:outline-none" />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={() => void crear()}
          disabled={!!guardando || !titulo.trim() || (asignadaA === 'persona' && !persona) || (!delColegio && !alumno)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-zero-600 px-4 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}{guardando || 'Crear tarea'}
        </button>
      </div>
    </>
  );
}

/** Busca un alumno del colegio por nombre, código o responsable. */
function BuscarAlumno({ onElegir }: { onElegir: (a: AlumnoDeTarea) => void }) {
  const [q, setQ] = useState('');
  const texto = q.trim();
  const { data, isLoading } = useSWR<{ estudiantes: { id: number; origen: string; nombres: string; apellidos: string; cursoActual: string | null; contacto: string | null }[] }>(
    texto.length >= 2 ? `/api/administracion-escolar/estudiantes?q=${encodeURIComponent(texto)}&estado=activo&limit=8` : null,
    traer, { keepPreviousData: true });
  // Los beneficiarios de Contactos todavía no son alumnos: no tienen ficha.
  const alumnos = texto.length >= 2 ? (data?.estudiantes ?? []).filter((e) => e.origen !== 'dependiente') : [];
  return (
    <div className="space-y-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumno"
        placeholder="Buscar alumno por nombre, código o responsable…"
        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
      {texto.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {isLoading && alumnos.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Buscando…</p>}
          {!isLoading && alumnos.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Ningún alumno activo con «{texto}».</p>}
          {alumnos.map((e) => (
            <button key={e.id} type="button"
              onClick={() => onElegir({ id: e.id, nombre: `${e.nombres} ${e.apellidos}`.trim(), familiaPosible: e.contacto != null })}
              className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-900">{`${e.nombres} ${e.apellidos}`.trim()}</span>
              <span className="text-xs text-gray-500">{[e.cursoActual, e.contacto].filter(Boolean).join(' · ') || 'Sin matrícula activa'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * «Nueva tarea» desde «Tareas»: del colegio o de un alumno que se busca
 * ahí. Al crearla se abre su conversación.
 */
export function PanelNuevaTarea({ abierto, onCerrar, onCreada }: {
  abierto: boolean; onCerrar: () => void; onCreada: (id: number) => void;
}) {
  return (
    <Drawer anchor="right" open={abierto} onClose={onCerrar} keepMounted={false}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Nueva tarea</h2>
            <p className="text-xs text-gray-500">Algo que alguien tiene que decidir o arreglar</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <NuevaTarea onCreada={onCreada} />
      </div>
    </Drawer>
  );
}

/**
 * Una tarea sola en el panel de la derecha, con su conversación. La abre la
 * pantalla «Tareas» y el enlace del correo (`?tarea=N`).
 */
export function PanelTarea({ tareaId, puedeGestionar, onCerrar, onCambio }: {
  tareaId: number | null; puedeGestionar: boolean; onCerrar: () => void; onCambio: () => void;
}) {
  const { data, error, mutate } = useSWR<{ tarea: TareaCompleta; yo: number; soporte?: boolean }>(
    tareaId ? `/api/administracion-escolar/tareas/${tareaId}` : null, traer);
  const refrescar = () => { void mutate(); onCambio(); };

  return (
    <Drawer anchor="right" open={tareaId != null} onClose={onCerrar}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
      <div className="flex h-full flex-col">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">{data?.tarea.titulo ?? 'Tarea'}</h2>
              <p className="text-xs text-gray-500">La conversación de esta tarea</p>
            </div>
            {data?.tarea.fichaId && (
              <Link href={`/escolar/estudiantes/${data.tarea.fichaId}`}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-zero-700 hover:bg-zero-50">
                Ficha<ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          {data && <CabeceraHilo tarea={data.tarea} />}
        </div>
        {error ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No se encontró esta tarea en el colegio.</p>
        ) : data ? (
          <Hilo tarea={data.tarea} yo={data.yo} soporte={data.soporte} puedeGestionar={puedeGestionar} onCambio={refrescar} />
        ) : (
          <div className="flex flex-1 justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
        )}
      </div>
    </Drawer>
  );
}
