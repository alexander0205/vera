'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Check, Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PanelNuevaTarea, PanelTarea, Segmento, traer } from '@/components/administracion-escolar/TareasEstudiante';
import { refrescarCampana } from '@/components/administracion-escolar/CampanaTareas';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ZERO_AI_TAREAS } from '@/lib/administracion-escolar/tareas-reglas';
import type { FamiliaConTareas, TareaDelColegio } from '@/lib/administracion-escolar/tareas';

/**
 * «Por revisar»: las tareas de todas las familias del colegio, juntas.
 *
 * La ficha de un alumno enseña las suyas; aquí se ve el colegio entero, para
 * quien tiene que decidir y no sabe todavía de qué alumno. Por defecto, las
 * que le tocan a quien mira. Las tareas van agrupadas por familia porque así
 * llegan los casos: un pago de más de un hermano se arregla con la factura del
 * otro; las que no son de nadie van arriba, en «Del colegio». Cada tarea se
 * abre en el mismo panel de conversación que en la ficha, y se completa sin
 * abrirla con la casilla. «Nueva tarea» crea una aquí mismo, del colegio o de
 * un alumno que se busca en el formulario.
 */

type Vista = 'mias' | 'todas' | 'hechas';
type Origen = 'todas' | 'ia' | 'personas';

interface Respuesta {
  familias: FamiliaConTareas[];
  cuentas: { mias: number; todas: number; hechas: number };
  kpis: { abiertas: number; familias: number; colegio: number; mias: number; ia: number; viejas: number };
}

const DIA = 86_400_000;
function edad(t: TareaDelColegio) {
  if (t.estado === 'completada') return { texto: 'Hecha', clase: 'text-emerald-700' };
  const dias = Math.floor((Date.now() - new Date(t.creadoEn).getTime()) / DIA);
  const texto = dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`;
  return { texto, clase: dias >= 7 ? 'text-red-700' : 'text-gray-600' };
}

/** «en 3 familias y 1 del colegio», «1 del colegio», «en 0 familias». */
function dondeEstan(familias: number, colegio: number) {
  const partes = [
    familias || !colegio ? `en ${familias} ${familias === 1 ? 'familia' : 'familias'}` : '',
    colegio ? `${colegio} del colegio` : '',
  ].filter(Boolean);
  return partes.join(' y ');
}

const inicialesDe = (asignada: string) => {
  if (asignada.startsWith('Soporte IT')) return 'IT';
  const p = asignada.trim().split(/\s+/).filter((x) => !/\.$/.test(x));
  return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? ''}`.toUpperCase() || '·';
};

export default function PorRevisarClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [vista, setVista] = useState<Vista>('mias');
  const [origen, setOrigen] = useState<Origen>('todas');
  const [asignada, setAsignada] = useState('');
  const [cambiando, setCambiando] = useState<number | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [creando, setCreando] = useState(false);

  // La tarea abierta vive en la URL: es lo que trae el enlace del correo.
  const abierta = Number(sp.get('tarea')) || null;
  const abrir = (id: number | null) => {
    const q = new URLSearchParams(sp.toString());
    if (id) q.set('tarea', String(id)); else q.delete('tarea');
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const clave = `/api/administracion-escolar/tareas/colegio?vista=${vista}&origen=${origen}&asignada=${asignada}`;
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(clave, traer, { keepPreviousData: true });

  async function marcar(t: TareaDelColegio) {
    setCambiando(t.id);
    try {
      const res = await fetch(`/api/administracion-escolar/tareas/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: t.estado === 'abierta' ? 'completar' : 'reabrir' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cambiar');
      toast.success(t.estado === 'abierta' ? 'Tarea completada' : 'Tarea abierta de nuevo');
      void mutate();
      refrescarCampana();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally { setCambiando(null); }
  }

  async function revisarConIa() {
    setRevisando(true);
    try {
      const res = await fetch('/api/administracion-escolar/tareas/zero-ai', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo revisar');
      if (d.nuevas > 0) toast.success(`Zero AI abrió ${d.nuevas} ${d.nuevas === 1 ? 'tarea nueva' : 'tareas nuevas'}`);
      else if (d.encontradas > 0) toast.info('Zero AI no encontró nada nuevo: lo que vio ya tiene su tarea');
      else toast.success('Zero AI no encontró nada por revisar');
      setOrigen('todas');
      void mutate();
      refrescarCampana();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo revisar');
    } finally { setRevisando(false); }
  }

  const k = data?.kpis;
  const cuentas = data?.cuentas;
  const familias = data?.familias ?? [];

  return (
    <section className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Por revisar</h1>
          <p className="mt-1 text-sm text-gray-500">
            Lo que alguien tiene que decidir o arreglar en el colegio y en sus familias.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Zero AI mira los cargos y las facturas y abre una tarea por cada
              cosa que alguien tiene que decidir: un pago de más guardado, un mes
              cobrado dos veces, una factura que no cubre su cargo. */}
          {ZERO_AI_TAREAS && puedeGestionar && (
            <button type="button" onClick={() => void revisarConIa()} disabled={revisando}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60">
              {revisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {revisando ? 'Revisando…' : 'Revisar con Zero AI'}
            </button>
          )}
          {puedeGestionar && (
            <button type="button" onClick={() => setCreando(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zero-600 px-3 text-sm font-semibold text-white hover:bg-zero-700">
              <Plus className="h-4 w-4" />Nueva tarea
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white ${ZERO_AI_TAREAS ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Kpi titulo="Abiertas" valor={k?.abiertas} resalte={!!k?.abiertas} nota={k ? dondeEstan(k.familias, k.colegio) : ''} />
        <Kpi titulo="Asignadas a ti" valor={k?.mias} nota="con tu nombre" />
        {ZERO_AI_TAREAS && <Kpi titulo="Sugeridas por Zero AI" valor={k?.ia} nota="las encontró al revisar facturas" />}
        <Kpi titulo="Más de una semana" valor={k?.viejas} nota={k?.viejas ? 'conviene moverlas' : 'nada atrasado'} alerta={!!k?.viejas} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmento etiqueta="Qué tareas" valor={vista} onCambio={setVista} opciones={[
          { id: 'mias', texto: `Asignadas a mí${cuentas ? ` · ${cuentas.mias}` : ''}` },
          { id: 'todas', texto: `Todo el colegio${cuentas ? ` · ${cuentas.todas}` : ''}` },
          { id: 'hechas', texto: `Completadas${cuentas ? ` · ${cuentas.hechas}` : ''}` },
        ]} />
        {ZERO_AI_TAREAS && (
          <Segmento etiqueta="Quién la creó" valor={origen} onCambio={setOrigen} opciones={[
            { id: 'todas', texto: 'Todas' }, { id: 'ia', texto: 'Zero AI' }, { id: 'personas', texto: 'Personas' },
          ]} />
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          Asignada a
          <select value={asignada} onChange={(e) => setAsignada(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-zero-500 focus:outline-none">
            <option value="">Cualquiera</option>
            <option value="soporte">Soporte IT · Zero</option>
            <option value="persona">Personas del colegio</option>
          </select>
        </label>
      </div>

      {isLoading && !data && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>}
      {error && <p className="text-sm text-red-600">No se pudieron leer las tareas.</p>}
      {data && familias.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
          {vista === 'mias' ? 'No tienes nada pendiente.' : 'Nada con estos filtros.'}
        </div>
      )}

      <div className="space-y-4">
        {familias.map((f) => (
          <div key={f.clave} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
              <p className="text-sm font-semibold text-gray-900">{f.nombre}</p>
              {f.alumnos && <p className="text-xs text-gray-500">{f.alumnos}</p>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.abiertas ? 'bg-amber-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                {f.abiertas ? `${f.abiertas} ${f.abiertas === 1 ? 'abierta' : 'abiertas'}` : 'al día'}
              </span>
              {f.estudianteId && (
                <Link href={`/escolar/estudiantes/${f.estudianteId}`} className="ml-auto text-xs font-medium text-zero-700 hover:underline">
                  Ir a la ficha →
                </Link>
              )}
            </div>
            <ul className="divide-y divide-gray-100">
              {f.tareas.map((t) => {
                const hecha = t.estado === 'completada';
                const e = edad(t);
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60">
                    {puedeGestionar ? (
                      <button type="button" onClick={() => void marcar(t)} disabled={cambiando === t.id}
                        aria-label={`${hecha ? 'Volver a abrir' : 'Marcar como completada'}: ${t.titulo}`}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                          hecha ? 'bg-emerald-600 text-white' : 'border-2 border-gray-400 bg-white hover:border-emerald-600'}`}>
                        {hecha && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ) : <span className="mt-0.5 h-5 w-5 shrink-0" />}
                    <button type="button" onClick={() => abrir(t.id)} className="min-w-0 flex-1 space-y-1 text-left">
                      <span className={`block text-sm font-semibold ${hecha ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</span>
                      {t.descripcion && <span className="line-clamp-1 block text-xs text-gray-600">{t.descripcion}</span>}
                      <span className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-gray-600">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5">{t.de}</span>
                        <span className="inline-flex items-center gap-1">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                            t.asignadaA === 'soporte' ? 'bg-violet-100 text-violet-800' : 'bg-zero-50 text-zero-700'}`}>
                            {inicialesDe(t.asignada)}
                          </span>
                          {t.asignada}
                        </span>
                        {t.creadaPorIa && (
                          <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700"><Sparkles className="h-3 w-3" />Zero AI</span>
                        )}
                        {t.documento && <span className="font-mono text-zero-700">{t.documento}</span>}
                      </span>
                    </button>
                    <span className={`shrink-0 text-xs font-semibold ${e.clase}`}>{e.texto}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <PanelTarea tareaId={abierta} puedeGestionar={puedeGestionar}
        onCerrar={() => abrir(null)} onCambio={() => void mutate()} />
      <PanelNuevaTarea abierto={creando} onCerrar={() => setCreando(false)}
        onCreada={(id) => {
          setCreando(false);
          // Se ve en «Todo el colegio» aunque no sea de quien la crea.
          if (vista === 'hechas') setVista('todas');
          void mutate();
          refrescarCampana();
          abrir(id);
        }} />
    </section>
  );
}

function Kpi({ titulo, valor, nota, resalte, alerta }: {
  titulo: string; valor: number | undefined; nota: string; resalte?: boolean; alerta?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 border-gray-100 px-4 py-3 [&:not(:first-child)]:border-l ${resalte ? 'bg-amber-50' : ''}`}>
      <span className="text-xs font-medium text-gray-500">{titulo}</span>
      <span className={`text-2xl font-bold tabular-nums ${alerta ? 'text-red-700' : 'text-gray-900'}`}>{valor ?? '—'}</span>
      <span className="text-xs text-gray-500">{nota}</span>
    </div>
  );
}
