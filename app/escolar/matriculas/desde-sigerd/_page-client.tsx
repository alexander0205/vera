'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Drawer from '@mui/material/Drawer';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, DownloadCloud, GraduationCap,
  Loader2, Pencil, RotateCcw, Search, UserCheck, UserMinus, UserX, Users, X, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';
import {
  PlanCobroSelector, aplicarPreciosPropios, type LineaPlan,
} from '@/components/administracion-escolar/PlanCobroSelector';

/**
 * Matricular de una vez a los alumnos que SIGERD ya tiene en su grado y
 * sección, revisándolos antes.
 *
 * Todos entran marcados y con lo que cobra su sección. Lo que se puede tocar:
 *  - quitar a un alumno (no se matricula ahora);
 *  - quitar un concepto a toda una sección (sus chips, arriba de la lista);
 *  - abrir a un alumno y quitarle un concepto o cambiarle el precio — es el
 *    mismo `PlanCobroSelector` de «Nueva matrícula», con las mismas reglas.
 *
 * Los montos de la lista salen del plan de cobro de cada sección (la misma
 * ruta que usa «Nueva matrícula») y de `cuotasAlMatricular`, que es el corte
 * con el que el servidor crea los cargos: lo que se ve es lo que queda.
 *
 * Al confirmar se matricula sección por sección —una petición cada una— para
 * ver el avance y no chocar con el tiempo máximo de una petición. Debajo es el
 * mismo `matricularLote` de «Matricular en lote».
 */

interface Alumno { id: number; nombre: string; sinResponsable: boolean }
interface Grupo {
  cursoId: number; curso: string; servicio: string; grado: string; seccion: string; tanda: string | null;
  estudiantes: Alumno[];
}
interface Omitido { nombre: string; ubicacion: string }
interface Pendientes {
  disponible: boolean;
  motivo?: string;
  periodo: { id: number; nombre: string } | null;
  anoAcademico: number | null;
  descargadaEl: string | null;
  grupos: Grupo[];
  porMatricular: number;
  yaMatriculados: number;
  sinEstudiante: Omitido[];
  sinSeccion: Omitido[];
}

type PlanSeccion =
  | { estado: 'cargando' }
  | { estado: 'listo'; lineas: LineaPlan[] }
  | { estado: 'error'; mensaje: string };

/** Lo que se decidió para un alumno al abrirlo. Sin entrada, va con lo de su sección. */
interface Ajuste {
  conceptos: number[];
  precios: { conceptoId: number; montoCentavos: number }[];
}

interface ResultadoAlumno {
  estudianteId: number; nombre: string;
  resultado: 'crear' | 'creada' | 'conflicto' | 'invalido' | 'error';
  motivo?: string;
}
interface Avance {
  cursoId: number;
  curso: string;
  alumnos: number;
  estado: 'esperando' | 'corriendo' | 'hecho' | 'fallo';
  creadas?: number;
  conflicto?: number;
  error?: number;
  mensaje?: string;
  problemas?: ResultadoAlumno[];
}

type Filtro = 'todos' | 'cambios' | 'fuera' | 'sin-responsable';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-DO');

const iniciales = (nombre: string) => {
  const p = nombre.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ''}${p[p.length > 2 ? 2 : 1]?.[0] ?? ''}`.toUpperCase() || '—';
};

// Un color por alumno, siempre el mismo: ayuda a no perder la fila al bajar.
const TONOS = [
  'bg-zero-100 text-zero-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
];
const tono = (id: number) => TONOS[id % TONOS.length];

const titulo = (g: Pick<Grupo, 'grado' | 'seccion' | 'tanda'>) =>
  `${g.grado}${g.seccion ? ` — Sección ${g.seccion}` : ''}`;

// Las tres alturas del árbol: nivel → grado → sección. La clave de cada nodo
// es lo que se guarda como «lo que se está viendo».
const claveNivel = (g: Grupo) => `n:${g.servicio}${g.tanda ? ` · ${g.tanda}` : ''}`;
const claveGrado = (g: Grupo) => `g:${claveNivel(g)}|${g.grado}`;
const claveSeccion = (g: Grupo) => `s:${g.cursoId}`;
const enAlcance = (g: Grupo, alcance: string | null) =>
  !alcance || alcance === claveNivel(g) || alcance === claveGrado(g) || alcance === claveSeccion(g);

/** Montos de la tabla del árbol: sin centavos, para que quepan. */
const rdCorto = (centavos: number) => `RD$${Math.round(centavos / 100).toLocaleString('es-DO')}`;

/** Cuánto se le carga hoy y cuánto en el año, con sus conceptos y sus precios. */
function cuentaDe(lineas: LineaPlan[], conceptos: number[], ajuste: Ajuste | undefined, fecha: string) {
  const propios = new Map((ajuste?.precios ?? []).map((p) => [p.conceptoId, p.montoCentavos]));
  const plan = aplicarPreciosPropios(lineas, propios);
  const { ahora, despues } = cuotasAlMatricular(plan, conceptos, fecha);
  const hoy = sumaCentavos(ahora);
  return { hoy, cargos: ahora.length, anio: hoy + sumaCentavos(despues) };
}

export default function MatricularDesdeSigerd() {
  const { can, isLoading: cargandoPermisos } = usePermissions();
  const puedePrecios = can('administracion-escolar:configurar');

  const [datos, setDatos] = useState<Pendientes | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyRD);
  const [planes, setPlanes] = useState<Map<number, PlanSeccion>>(new Map());

  const [fuera, setFuera] = useState<Set<number>>(new Set());
  const [quitadosSeccion, setQuitadosSeccion] = useState<Map<number, Set<number>>>(new Map());
  const [ajustes, setAjustes] = useState<Map<number, Ajuste>>(new Map());

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  /** El nivel, grado o sección elegido en la tabla de la izquierda. `null` = todo. */
  const [alcance, setAlcance] = useState<string | null>(null);
  const [verOmitidos, setVerOmitidos] = useState(false);
  const [editando, setEditando] = useState<{ alumno: Alumno; grupo: Grupo } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [avance, setAvance] = useState<Avance[] | null>(null);
  const corriendo = avance?.some((a) => a.estado === 'esperando' || a.estado === 'corriendo') ?? false;

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo leer SIGERD');
      setDatos(d);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudo leer SIGERD');
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  // El plan de cada sección, con la fecha elegida: la fecha decide qué cuotas
  // ya tocan y cuáles espera el devengo.
  useEffect(() => {
    if (!datos?.periodo || datos.grupos.length === 0) return;
    let vigente = true;
    const periodoId = String(datos.periodo.id);
    setPlanes(new Map(datos.grupos.map((g) => [g.cursoId, { estado: 'cargando' } as PlanSeccion])));
    for (const g of datos.grupos) {
      const params = new URLSearchParams({ periodoId, cursoId: String(g.cursoId), desde: fecha });
      fetch(`/api/administracion-escolar/matriculas/plan-cobro?${params}`)
        .then(async (res) => {
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? 'No se pudo calcular');
          return { estado: 'listo', lineas: d.lineas as LineaPlan[] } as PlanSeccion;
        })
        .catch((e: unknown) => ({ estado: 'error', mensaje: e instanceof Error ? e.message : 'Error' } as PlanSeccion))
        .then((p) => { if (vigente) setPlanes((m) => new Map(m).set(g.cursoId, p)); });
    }
    return () => { vigente = false; };
  }, [datos, fecha]);

  /** Los conceptos que se le cobran a un alumno, si nadie lo abrió: los de su sección. */
  const conceptosDe = useCallback((alumnoId: number, cursoId: number): number[] | null => {
    const a = ajustes.get(alumnoId);
    if (a) return a.conceptos;
    const p = planes.get(cursoId);
    if (p?.estado !== 'listo') return null;
    const quitados = quitadosSeccion.get(cursoId);
    return p.lineas.map((l) => l.conceptoId).filter((c) => !quitados?.has(c));
  }, [ajustes, planes, quitadosSeccion]);

  // Por sección: cada alumno con su cuenta. Es lo que pinta la lista y lo que
  // suma el resumen.
  const cuentas = useMemo(() => {
    const m = new Map<number, { hoy: number; cargos: number; anio: number }>();
    if (!datos) return m;
    for (const g of datos.grupos) {
      const p = planes.get(g.cursoId);
      if (p?.estado !== 'listo') continue;
      for (const e of g.estudiantes) {
        const conceptos = conceptosDe(e.id, g.cursoId) ?? [];
        m.set(e.id, cuentaDe(p.lineas, conceptos, ajustes.get(e.id), fecha));
      }
    }
    return m;
  }, [datos, planes, conceptosDe, ajustes, fecha]);

  const resumen = useMemo(() => {
    const r = { alumnos: 0, secciones: 0, hoy: 0, anio: 0, cargos: 0, sinResponsable: 0, conCambios: ajustes.size };
    for (const g of datos?.grupos ?? []) {
      const dentro = g.estudiantes.filter((e) => !fuera.has(e.id));
      if (dentro.length > 0) r.secciones++;
      for (const e of dentro) {
        r.alumnos++;
        if (e.sinResponsable) r.sinResponsable++;
        const c = cuentas.get(e.id);
        if (c) { r.hoy += c.hoy; r.anio += c.anio; r.cargos += c.cargos; }
      }
    }
    return r;
  }, [datos, fuera, cuentas, ajustes]);

  const planesListos = datos?.grupos.every((g) => planes.get(g.cursoId)?.estado === 'listo') ?? false;

  // Lo que se ve con la búsqueda y el filtro. La sección se queda si le queda alguien.
  const q = norm(busqueda.trim());
  const visibles = useMemo(() => (datos?.grupos ?? [])
    .filter((g) => enAlcance(g, alcance))
    .map((g) => ({
      ...g,
      estudiantes: g.estudiantes.filter((e) => {
        if (q && !norm(e.nombre).includes(q)) return false;
        if (filtro === 'cambios') return ajustes.has(e.id);
        if (filtro === 'fuera') return fuera.has(e.id);
        if (filtro === 'sin-responsable') return e.sinResponsable;
        return true;
      }),
    }))
    .filter((g) => g.estudiantes.length > 0), [datos, alcance, q, filtro, ajustes, fuera]);

  function alternarFuera(ids: number[], sacar: boolean) {
    setFuera((s) => {
      const n = new Set(s);
      for (const id of ids) { if (sacar) n.add(id); else n.delete(id); }
      return n;
    });
  }

  /**
   * Quitar (o volver a poner) un concepto a toda la sección. A quien ya se le
   * había abierto también se le aplica: «a la sección» es a todos.
   */
  function alternarConceptoSeccion(g: Grupo, conceptoId: number) {
    const quitar = !quitadosSeccion.get(g.cursoId)?.has(conceptoId);
    setQuitadosSeccion((m) => {
      const n = new Map(m);
      const s = new Set(n.get(g.cursoId));
      if (quitar) s.add(conceptoId); else s.delete(conceptoId);
      n.set(g.cursoId, s);
      return n;
    });
    setAjustes((m) => {
      const n = new Map(m);
      for (const e of g.estudiantes) {
        const a = n.get(e.id);
        if (!a) continue;
        const conceptos = quitar
          ? a.conceptos.filter((c) => c !== conceptoId)
          : [...new Set([...a.conceptos, conceptoId])];
        n.set(e.id, { ...a, conceptos });
      }
      return n;
    });
  }

  /** Lo que devuelve el cajón de un alumno. Igual que su sección = sin ajuste. */
  const guardarAjuste = useCallback((alumnoId: number, cursoId: number, a: Ajuste) => {
    const p = planes.get(cursoId);
    const quitados = quitadosSeccion.get(cursoId);
    const deSeccion = p?.estado === 'listo'
      ? p.lineas.map((l) => l.conceptoId).filter((c) => !quitados?.has(c)) : null;
    const igual = deSeccion != null && a.precios.length === 0
      && a.conceptos.length === deSeccion.length && deSeccion.every((c) => a.conceptos.includes(c));
    setAjustes((m) => {
      const n = new Map(m);
      if (igual) n.delete(alumnoId); else n.set(alumnoId, a);
      return n;
    });
  }, [planes, quitadosSeccion]);

  async function matricular() {
    if (!datos) return;
    setConfirmar(false);
    const porSeccion = datos.grupos
      .map((g) => ({ g, alumnos: g.estudiantes.filter((e) => !fuera.has(e.id)) }))
      .filter((x) => x.alumnos.length > 0);
    setAvance(porSeccion.map(({ g, alumnos }) => ({
      cursoId: g.cursoId, curso: g.curso, alumnos: alumnos.length, estado: 'esperando',
    })));
    const marcar = (cursoId: number, cambio: Partial<Avance>) =>
      setAvance((av) => av?.map((a) => (a.cursoId === cursoId ? { ...a, ...cambio } : a)) ?? av);

    for (const { g, alumnos } of porSeccion) {
      marcar(g.cursoId, { estado: 'corriendo' });
      try {
        const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cursoId: g.cursoId,
            fechaInscripcion: fecha,
            alumnos: alumnos.map((e) => ({
              estudianteId: e.id,
              conceptos: conceptosDe(e.id, g.cursoId) ?? [],
              precios: ajustes.get(e.id)?.precios ?? [],
            })),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? 'No se pudo matricular esta sección');
        const nombres = new Map(alumnos.map((e) => [e.id, e.nombre]));
        marcar(g.cursoId, {
          estado: 'hecho', creadas: d.creadas, conflicto: d.conflicto, error: d.error,
          problemas: (d.resultados as ResultadoAlumno[])
            .filter((r) => r.resultado !== 'creada')
            .map((r) => ({ ...r, nombre: nombres.get(r.estudianteId) ?? r.nombre })),
        });
      } catch (e) {
        marcar(g.cursoId, { estado: 'fallo', mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }
  }

  // ── Estados de la página ──────────────────────────────────────────────
  const volver = (
    <Link href="/escolar/matriculas"
      className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-zero-600">
      <ArrowLeft className="h-4 w-4" aria-hidden />Matriculación
    </Link>
  );

  if (errorCarga) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">No se pudo leer lo que dice SIGERD.</p>
          <p className="mt-1 text-sm text-red-700">{errorCarga}</p>
          <div className="mt-3"><Button variant="outline" onClick={() => void cargar()}>Intentar otra vez</Button></div>
        </div>
      </section>
    );
  }

  if (!datos || cargandoPermisos) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div role="status" className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zero-600" aria-hidden />
          <span className="sr-only">Cargando…</span>
        </div>
      </section>
    );
  }

  if (avance) return <Progreso avance={avance} corriendo={corriendo} volver={volver} periodo={datos.periodo?.nombre ?? ''} />;

  if (!datos.disponible || datos.porMatricular === 0) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zero-50 text-zero-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-gray-900">
            {datos.disponible ? 'No hay alumnos de SIGERD por matricular' : datos.motivo}
          </p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {datos.disponible
              ? `Los ${datos.yaMatriculados} que SIGERD tiene en ${datos.periodo?.nombre} ya tienen su matrícula.`
              : 'Descarga los datos del centro en Configuración › SIGERD y vuelve aquí.'}
          </p>
          {!datos.disponible && (
            <Link href="/escolar/configuracion/sigerd" className="mt-4 text-sm font-medium text-zero-700 hover:underline">
              Ir a Configuración › SIGERD
            </Link>
          )}
        </div>
      </section>
    );
  }

  const omitidos = [...datos.sinSeccion, ...datos.sinEstudiante];
  const descargada = datos.descargadaEl
    ? new Date(datos.descargadaEl).toLocaleString('es-DO', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santo_Domingo',
      })
    : null;
  const filtros: Array<{ id: Filtro; etiqueta: string; n: number }> = [
    { id: 'todos', etiqueta: 'Todos', n: datos.porMatricular },
    { id: 'cambios', etiqueta: 'Con cambios', n: ajustes.size },
    { id: 'fuera', etiqueta: 'No se matriculan', n: fuera.size },
    { id: 'sin-responsable', etiqueta: 'Sin responsable', n: datos.grupos.reduce((n, g) => n + g.estudiantes.filter((e) => e.sinResponsable).length, 0) },
  ];

  return (
    <section className="space-y-5 p-4 pb-0 sm:p-6 sm:pb-0">
      {volver}

      {/* ── Encabezado ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zero-600 text-white shadow-sm">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Matricular desde SIGERD</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Cada alumno entra en el grado y la sección que tiene en SIGERD · {datos.periodo?.nombre}
              {descargada && <span className="text-gray-400"> · datos descargados el {descargada}</span>}
            </p>
          </div>
        </div>
        <label className="flex flex-col gap-1 self-start lg:self-auto">
          <span className="text-xs font-medium text-gray-600">Fecha de inscripción</span>
          <input type="date" value={fecha} max="2100-12-31"
            onChange={(e) => { if (e.target.value) setFecha(e.target.value); }}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
          <span className="text-[11px] text-gray-500">Decide qué cuotas se cargan hoy</span>
        </label>
      </div>

      {/* ── Resumen ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={<UserCheck className="h-4 w-4" />} etiqueta="Se matriculan"
          valor={String(resumen.alumnos)} nota={`de ${datos.porMatricular} pendientes`} destacado />
        <Kpi icono={<GraduationCap className="h-4 w-4" />} etiqueta="Secciones"
          valor={String(resumen.secciones)} nota={resumen.conCambios > 0 ? `${resumen.conCambios} alumno(s) con cambios` : 'todos con lo de su sección'} />
        <Kpi icono={<Check className="h-4 w-4" />} etiqueta="Se carga hoy"
          valor={planesListos ? fmtDOP(resumen.hoy) : '…'} nota={planesListos ? `${resumen.cargos} cargo(s) pendientes` : 'calculando'} />
        <Kpi icono={<Users className="h-4 w-4" />} etiqueta="Compromiso del año"
          valor={planesListos ? fmtDOP(resumen.anio) : '…'} nota="el resto se genera mes a mes" />
      </div>

      {/* ── Avisos ─────────────────────────────────────────────────── */}
      {(resumen.sinResponsable > 0 || omitidos.length > 0) && (
        <div className="space-y-2">
          {resumen.sinResponsable > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <span className="font-medium">{resumen.sinResponsable} alumno(s) sin responsable de pago.</span>{' '}
                Se matriculan igual, pero sus cargos no se facturan ni les llegan avisos hasta asignarles uno en su ficha.
              </p>
              <button type="button" onClick={() => setFiltro('sin-responsable')}
                className="ml-auto shrink-0 text-xs font-medium text-amber-800 hover:underline">Ver</button>
            </div>
          )}
          {omitidos.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <button type="button" onClick={() => setVerOmitidos((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
                <UserX className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="flex-1 text-gray-700">
                  <span className="font-medium text-gray-900">{omitidos.length} quedan fuera</span> — no se pueden
                  matricular sin adivinar ({datos.sinEstudiante.length} sin cruzar con un estudiante,{' '}
                  {datos.sinSeccion.length} sin sección clara)
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${verOmitidos ? 'rotate-90' : ''}`} />
              </button>
              {verOmitidos && (
                <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
                  {omitidos.map((o, i) => (
                    <li key={`${o.nombre}-${i}`} className="flex flex-col gap-0.5 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-gray-900">{o.nombre}</span>
                      <span className="text-xs text-gray-500">{o.ubicacion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Lista ──────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Nivel → grado → sección, como tabla: cuántos entran y cuánto se carga hoy. */}
        <aside className="hidden lg:block">
          <ArbolSecciones
            grupos={datos.grupos} fuera={fuera} cuentas={cuentas}
            alcance={alcance} onAlcance={setAlcance}
            onIncluir={alternarFuera} />
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Buscar y filtrar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar un alumno…"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
              {filtros.map((f) => (
                <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  {f.etiqueta} <span className="tabular-nums text-gray-400">{f.n}</span>
                </button>
              ))}
            </div>
          </div>

          {alcance && (() => {
            const g = datos.grupos.find((x) => enAlcance(x, alcance));
            const que = !g ? '' : alcance.startsWith('n:') ? claveNivel(g).slice(2)
              : alcance.startsWith('g:') ? `${claveNivel(g).slice(2)} › ${g.grado}` : titulo(g);
            return (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Viendo <span className="font-medium text-gray-900">{que}</span></span>
                <button type="button" onClick={() => setAlcance(null)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zero-700 hover:bg-zero-50">
                  <X className="h-3 w-3" />Ver todas
                </button>
              </div>
            );
          })()}

          {visibles.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
              Ningún alumno coincide.
            </p>
          )}

          {visibles.map((g) => {
            const completo = datos.grupos.find((x) => x.cursoId === g.cursoId)!;
            const plan = planes.get(g.cursoId);
            const quitados = quitadosSeccion.get(g.cursoId);
            const dentro = completo.estudiantes.filter((e) => !fuera.has(e.id));
            const todosDentro = dentro.length === completo.estudiantes.length;
            const hoySeccion = dentro.reduce((s, e) => s + (cuentas.get(e.id)?.hoy ?? 0), 0);
            return (
              <article key={g.cursoId} id={`seccion-${g.cursoId}`}
                className="scroll-mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <header className="space-y-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={todosDentro}
                      ref={(el) => { if (el) el.indeterminate = dentro.length > 0 && !todosDentro; }}
                      onChange={() => alternarFuera(completo.estudiantes.map((e) => e.id), todosDentro)}
                      aria-label={`Matricular a toda la sección ${titulo(g)}`}
                      className="h-4 w-4 shrink-0 accent-zero-600" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-gray-900">{titulo(g)}</h2>
                      <p className="text-xs text-gray-500">
                        {g.tanda ? `${g.tanda} · ` : ''}{dentro.length} de {completo.estudiantes.length} se matriculan
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-gray-900">
                        {plan?.estado === 'listo' ? fmtDOP(hoySeccion) : '…'}
                      </p>
                      <p className="text-[11px] text-gray-500">se carga hoy</p>
                    </div>
                  </div>

                  {/* Conceptos de la sección: quitar uno aquí es quitárselo a todos. */}
                  {plan?.estado === 'cargando' && (
                    <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Calculando lo que cobra la sección…</p>
                  )}
                  {plan?.estado === 'error' && <p className="text-xs text-red-600">{plan.mensaje}</p>}
                  {plan?.estado === 'listo' && (plan.lineas.length === 0 ? (
                    <p className="text-xs text-amber-700">Esta sección no tiene tarifas: las matrículas se crean sin cargos.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Cobra</span>
                      {plan.lineas.map((l) => {
                        const activo = !quitados?.has(l.conceptoId);
                        return (
                          <button key={l.conceptoId} type="button"
                            onClick={() => alternarConceptoSeccion(completo, l.conceptoId)}
                            title={activo ? 'Quitar a toda la sección' : 'Volver a cobrar a toda la sección'}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              activo
                                ? 'border-zero-200 bg-white text-gray-800 hover:border-zero-300'
                                : 'border-dashed border-gray-300 bg-transparent text-gray-400 line-through'}`}>
                            {activo ? <Check className="h-3 w-3 text-zero-600" /> : <X className="h-3 w-3" />}
                            {l.nombre}
                            <span className="tabular-nums text-gray-500">
                              {fmtDOP(l.montoCentavos)}{l.tipo === 'mensualidad' ? '/mes' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </header>

                <ul className="divide-y divide-gray-100">
                  {g.estudiantes.map((e) => {
                    const sale = fuera.has(e.id);
                    const c = cuentas.get(e.id);
                    const a = ajustes.get(e.id);
                    const lineas = plan?.estado === 'listo' ? plan.lineas : [];
                    const suyos = new Set(conceptosDe(e.id, g.cursoId) ?? []);
                    const sinEstos = lineas.filter((l) => !suyos.has(l.conceptoId) && !quitados?.has(l.conceptoId));
                    return (
                      <li key={e.id}
                        className={`group flex items-center gap-3 px-4 py-2.5 transition-colors ${sale ? 'bg-gray-50' : 'hover:bg-zero-50/40'}`}>
                        <input type="checkbox" checked={!sale}
                          onChange={() => alternarFuera([e.id], !sale)}
                          aria-label={`Matricular a ${e.nombre}`}
                          className="h-4 w-4 shrink-0 accent-zero-600" />
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${sale ? 'bg-gray-200 text-gray-400' : tono(e.id)}`}>
                          {iniciales(e.nombre)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${sale ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.nombre}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {sale && <Chip tono="gris">No se matricula ahora</Chip>}
                            {!sale && a?.precios.map((p) => {
                              const l = lineas.find((x) => x.conceptoId === p.conceptoId);
                              return <Chip key={p.conceptoId} tono="ambar">{l?.nombre ?? 'Concepto'}: {fmtDOP(p.montoCentavos)}</Chip>;
                            })}
                            {!sale && sinEstos.map((l) => <Chip key={l.conceptoId} tono="gris">Sin {l.nombre}</Chip>)}
                            {!sale && e.sinResponsable && <Chip tono="rojo">Sin responsable de pago</Chip>}
                          </div>
                        </div>
                        {!sale && (
                          <div className="hidden text-right sm:block">
                            <p className="text-sm tabular-nums text-gray-900">{c ? fmtDOP(c.hoy) : '…'}</p>
                            <p className="text-[11px] tabular-nums text-gray-500">{c ? `${fmtDOP(c.anio)} el año` : ''}</p>
                          </div>
                        )}
                        <div className="flex shrink-0 items-center gap-1">
                          {sale ? (
                            <button type="button" onClick={() => alternarFuera([e.id], false)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zero-700 hover:bg-zero-50">
                              <RotateCcw className="h-3.5 w-3.5" />Incluir
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={() => setEditando({ alumno: e, grupo: completo })}
                                disabled={plan?.estado !== 'listo'}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-zero-300 hover:text-zero-700 disabled:opacity-40">
                                <Pencil className="h-3.5 w-3.5" />Editar
                              </button>
                              <button type="button" onClick={() => alternarFuera([e.id], true)}
                                title="No matricular a este alumno ahora" aria-label={`No matricular a ${e.nombre}`}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>

      {/* ── Barra de acción ────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-gray-200 bg-white/90 backdrop-blur sm:-mx-6">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{resumen.alumnos}</span> alumno(s) en{' '}
            <span className="font-semibold text-gray-900">{resumen.secciones}</span> sección(es)
            {planesListos && <> · se cargan hoy <span className="font-semibold text-gray-900">{fmtDOP(resumen.hoy)}</span></>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/escolar/matriculas">Cancelar</Link></Button>
            <Button className="bg-zero-600 hover:bg-zero-700" disabled={resumen.alumnos === 0 || !planesListos}
              onClick={() => setConfirmar(true)}>
              <GraduationCap className="mr-2 h-4 w-4" />Matricular {resumen.alumnos}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmar} onOpenChange={setConfirmar}
        title={`¿Matricular a ${resumen.alumnos} alumno(s)?`}
        icon={<GraduationCap className="h-5 w-5 text-zero-600" />}
        description={(
          <>
            Se crean {resumen.alumnos} matrícula(s) en {resumen.secciones} sección(es) con fecha de inscripción{' '}
            {fecha.split('-').reverse().join('/')}, y {resumen.cargos} cargo(s) pendientes por {fmtDOP(resumen.hoy)}.
            No se cobra nada ahora.
            {fuera.size > 0 && ` ${fuera.size} alumno(s) se quedan sin matricular.`}
          </>
        )}
        confirmLabel="Sí, matricular" onConfirm={() => void matricular()} />

      <Drawer anchor="right" open={!!editando} onClose={() => setEditando(null)} keepMounted={false}
        slotProps={{
          backdrop: { sx: { backdropFilter: 'blur(2px)' } },
          // Ancho: el precio, «Cambiar» y «Volver a …» de cada concepto caben
          // en una línea y se leen de un vistazo.
          paper: { sx: { width: { xs: '100%', sm: 640, lg: 760 }, borderTopLeftRadius: { sm: 16 }, borderBottomLeftRadius: { sm: 16 } } },
        }}>
        {editando && datos.periodo && (
          <EditorAlumno
            key={editando.alumno.id}
            alumno={editando.alumno}
            grupo={editando.grupo}
            periodoId={datos.periodo.id}
            fecha={fecha}
            inicial={{
              conceptos: conceptosDe(editando.alumno.id, editando.grupo.cursoId) ?? undefined,
              precios: ajustes.get(editando.alumno.id)?.precios ?? [],
            }}
            puedePrecios={puedePrecios}
            onGuardar={(a) => { guardarAjuste(editando.alumno.id, editando.grupo.cursoId, a); setEditando(null); }}
            onRestablecer={() => {
              setAjustes((m) => { const n = new Map(m); n.delete(editando.alumno.id); return n; });
              setEditando(null);
            }}
            onSacar={() => { alternarFuera([editando.alumno.id], true); setEditando(null); }}
            onCerrar={() => setEditando(null)}
            conCambios={ajustes.has(editando.alumno.id)}
          />
        )}
      </Drawer>
    </section>
  );
}

/**
 * La estructura de lo que se va a matricular, como tabla con hijos: nivel →
 * grado → sección. Cada fila dice cuántos entran de cuántos y cuánto se les
 * carga hoy; su casilla mete o saca a todos los de debajo, y pulsar el nombre
 * deja la lista solo con esa parte.
 */
function ArbolSecciones({ grupos, fuera, cuentas, alcance, onAlcance, onIncluir }: {
  grupos: Grupo[];
  fuera: Set<number>;
  cuentas: Map<number, { hoy: number }>;
  alcance: string | null;
  onAlcance: (clave: string | null) => void;
  onIncluir: (ids: number[], sacar: boolean) => void;
}) {
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());

  const niveles = useMemo(() => {
    const m = new Map<string, { clave: string; nombre: string; grados: Map<string, { clave: string; nombre: string; grupos: Grupo[] }> }>();
    for (const g of grupos) {
      const kn = claveNivel(g);
      const nivel = m.get(kn) ?? { clave: kn, nombre: kn.slice(2), grados: new Map() };
      const kg = claveGrado(g);
      const grado = nivel.grados.get(kg) ?? { clave: kg, nombre: g.grado, grupos: [] };
      grado.grupos.push(g);
      nivel.grados.set(kg, grado);
      m.set(kn, nivel);
    }
    return [...m.values()].map((n) => ({ ...n, grados: [...n.grados.values()] }));
  }, [grupos]);

  const suma = (gs: Grupo[]) => {
    let total = 0, dentro = 0, hoy = 0;
    const ids: number[] = [];
    for (const g of gs) {
      for (const e of g.estudiantes) {
        total++; ids.push(e.id);
        if (!fuera.has(e.id)) { dentro++; hoy += cuentas.get(e.id)?.hoy ?? 0; }
      }
    }
    return { total, dentro, hoy, ids };
  };

  const plegar = (clave: string) => setCerrados((s) => {
    const n = new Set(s);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  const fila = ({ clave, hondura, etiqueta, gs, plegable }: {
    clave: string | null; hondura: 0 | 1 | 2 | 3; etiqueta: string; gs: Grupo[]; plegable: boolean;
  }) => {
    const t = suma(gs);
    const todos = t.dentro === t.total;
    const elegida = alcance === clave;
    const abierta = clave == null || !cerrados.has(clave);
    return (
      <tr key={clave ?? 'todo'}
        className={`group border-t border-gray-100 first:border-t-0 ${elegida ? 'bg-zero-50' : 'hover:bg-gray-50'}`}>
        <td className="py-1.5 pr-2" style={{ paddingLeft: 8 + Math.max(hondura - 1, 0) * 16 }}>
          <div className="flex min-w-0 items-center gap-1.5">
            {plegable && clave ? (
              <button type="button" onClick={() => plegar(clave)} aria-label={abierta ? `Plegar ${etiqueta}` : `Desplegar ${etiqueta}`}
                aria-expanded={abierta}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${abierta ? 'rotate-90' : ''}`} />
              </button>
            ) : <span className="w-5 shrink-0" />}
            <input type="checkbox" checked={todos}
              ref={(el) => { if (el) el.indeterminate = t.dentro > 0 && !todos; }}
              onChange={() => onIncluir(t.ids, todos)}
              aria-label={`Matricular a todos en ${etiqueta}`}
              className="h-3.5 w-3.5 shrink-0 accent-zero-600" />
            <button type="button" onClick={() => onAlcance(elegida ? null : clave)} title={etiqueta}
              className={`min-w-0 truncate text-left ${
                hondura <= 1 ? 'font-semibold text-gray-900' : hondura === 2 ? 'font-medium text-gray-800' : 'text-gray-600'
              } ${elegida ? 'text-zero-800' : ''} hover:text-zero-700`}>
              {etiqueta}
            </button>
          </div>
        </td>
        <td className="py-1.5 text-center">
          <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${
            todos ? 'bg-gray-100 text-gray-600' : t.dentro === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-100 text-amber-800'}`}>
            {t.dentro}/{t.total}
          </span>
        </td>
        <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-gray-700">{rdCorto(t.hoy)}</td>
      </tr>
    );
  };

  return (
    <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full table-fixed text-[13px]">
        <colgroup><col /><col className="w-16" /><col className="w-24" /></colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="py-2 pl-3 text-left font-medium">Nivel · grado · sección</th>
            <th className="py-2 text-center font-medium">Entran</th>
            <th className="py-2 pr-3 text-right font-medium">Hoy</th>
          </tr>
        </thead>
        <tbody>
          {fila({ clave: null, hondura: 0, etiqueta: 'Todas las secciones', gs: grupos, plegable: false })}
          {niveles.flatMap((n) => {
            const filas = [fila({ clave: n.clave, hondura: 1, etiqueta: n.nombre, gs: n.grados.flatMap((g) => g.grupos), plegable: true })];
            if (cerrados.has(n.clave)) return filas;
            for (const gr of n.grados) {
              filas.push(fila({ clave: gr.clave, hondura: 2, etiqueta: gr.nombre, gs: gr.grupos, plegable: true }));
              if (cerrados.has(gr.clave)) continue;
              for (const g of gr.grupos) {
                filas.push(fila({
                  clave: claveSeccion(g), hondura: 3,
                  etiqueta: g.seccion ? `Sección ${g.seccion}` : g.curso, gs: [g], plegable: false,
                }));
              }
            }
            return filas;
          })}
        </tbody>
      </table>
    </div>
  );
}

/** El cajón de un alumno: sus conceptos y sus precios, con el selector de «Nueva matrícula». */
function EditorAlumno({
  alumno, grupo, periodoId, fecha, inicial, puedePrecios, conCambios, onGuardar, onRestablecer, onSacar, onCerrar,
}: {
  alumno: Alumno;
  grupo: Grupo;
  periodoId: number;
  fecha: string;
  inicial: { conceptos?: number[]; precios: Ajuste['precios'] };
  puedePrecios: boolean;
  conCambios: boolean;
  onGuardar: (a: Ajuste) => void;
  onRestablecer: () => void;
  onSacar: () => void;
  onCerrar: () => void;
}) {
  // Lo que el selector va diciendo. Antes de que llegue el plan su lista de
  // conceptos va vacía sin querer decir «ninguno»: hasta entonces no se guarda.
  const [cargado, setCargado] = useState(false);
  const [conceptos, setConceptos] = useState<number[]>([]);
  const [precios, setPrecios] = useState<Ajuste['precios']>(inicial.precios);
  const [inicialFijo] = useState(inicial);

  const alLlegarPlan = useCallback(() => setCargado(true), []);
  const alCambiar = useCallback((ids: number[]) => setConceptos(ids), []);
  const alCambiarPrecios = useCallback((ps: { conceptoId: number; montoCentavos: number }[]) => {
    setPrecios(ps.map((p) => ({ conceptoId: p.conceptoId, montoCentavos: p.montoCentavos })));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tono(alumno.id)}`}>
          {iniciales(alumno.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900">{alumno.nombre}</h2>
          <p className="text-xs text-gray-500">{titulo(grupo)}{grupo.tanda ? ` · ${grupo.tanda}` : ''}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {alumno.sinResponsable && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            No tiene responsable de pago: sus cargos no se facturarán hasta asignarle uno en su ficha.
          </div>
        )}
        <PlanCobroSelector
          periodoId={String(periodoId)}
          cursoId={String(grupo.cursoId)}
          desde={fecha}
          estudianteId={alumno.id}
          inicial={inicialFijo}
          onPlan={alLlegarPlan}
          onCambio={alCambiar}
          onPrecios={puedePrecios ? alCambiarPrecios : undefined}
        />
        {!puedePrecios && (
          <p className="text-xs text-gray-500">
            Cambiar el precio de un alumno lo hace quien puede tocar Tarifas. Aquí puedes quitarle conceptos.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          <button type="button" onClick={onSacar}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
            <UserMinus className="h-4 w-4" />No matricular ahora
          </button>
          {conCambios && (
            <button type="button" onClick={onRestablecer}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
              <RotateCcw className="h-4 w-4" />Lo de su sección
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" disabled={!cargado}
            onClick={() => onGuardar({ conceptos, precios })}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Mientras se matricula, y cuando termina: sección por sección. */
function Progreso({ avance, corriendo, volver, periodo }: {
  avance: Avance[]; corriendo: boolean; volver: ReactNode; periodo: string;
}) {
  const hechas = avance.filter((a) => a.estado === 'hecho' || a.estado === 'fallo').length;
  const creadas = avance.reduce((n, a) => n + (a.creadas ?? 0), 0);
  const conflicto = avance.reduce((n, a) => n + (a.conflicto ?? 0), 0);
  const conError = avance.reduce((n, a) => n + (a.error ?? 0) + (a.estado === 'fallo' ? a.alumnos : 0), 0);
  const pct = Math.round((hechas / Math.max(avance.length, 1)) * 100);

  return (
    <section className="space-y-5 p-4 sm:p-6">
      {!corriendo && volver}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${corriendo ? 'bg-zero-50 text-zero-600' : conError > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {corriendo ? <Loader2 className="h-5 w-5 animate-spin" /> : conError > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {corriendo ? 'Matriculando…' : conError > 0 ? 'Terminado, con avisos' : 'Listo: alumnos matriculados'}
            </h1>
            <p className="text-sm text-gray-500">
              {corriendo ? `Sección ${Math.min(hechas + 1, avance.length)} de ${avance.length}. No cierres esta página.` : `${periodo} · ${avance.length} sección(es)`}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-zero-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {!corriendo && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Kpi icono={<UserCheck className="h-4 w-4" />} etiqueta="Matriculados" valor={String(creadas)} destacado />
            <Kpi icono={<Check className="h-4 w-4" />} etiqueta="Ya tenían matrícula" valor={String(conflicto)} />
            <Kpi icono={<XCircle className="h-4 w-4" />} etiqueta="Con error" valor={String(conError)} />
          </div>
        )}
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {avance.map((a) => (
          <li key={a.cursoId} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {a.estado === 'corriendo' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zero-600" />
                : a.estado === 'esperando' ? <span className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-200" />
                : a.estado === 'fallo' || (a.error ?? 0) > 0 ? <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                : (a.conflicto ?? 0) > 0 ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.curso}</span>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                {a.estado === 'hecho' ? `${a.creadas} de ${a.alumnos}` : a.estado === 'fallo' ? 'no se matriculó' : `${a.alumnos} alumno(s)`}
              </span>
            </div>
            {a.mensaje && <p className="mt-1 pl-7 text-xs text-red-600">{a.mensaje}</p>}
            {a.problemas && a.problemas.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 pl-7">
                {a.problemas.map((p) => (
                  <li key={p.estudianteId} className="text-xs text-gray-600">
                    <span className="text-gray-900">{p.nombre}</span> — {p.motivo ?? p.resultado}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {!corriendo && (
        <div className="flex justify-end">
          <Button className="bg-zero-600 hover:bg-zero-700" asChild>
            <Link href="/escolar/matriculas">Ver matrículas</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function Kpi({ icono, etiqueta, valor, nota, destacado }: {
  icono: ReactNode; etiqueta: string; valor: string; nota?: string; destacado?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacado ? 'border-zero-200 bg-zero-50' : 'border-gray-200 bg-white'}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${destacado ? 'text-zero-700' : 'text-gray-500'}`}>
        {icono}{etiqueta}
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${destacado ? 'text-zero-800' : 'text-gray-900'}`}>{valor}</p>
      {nota && <p className="mt-0.5 truncate text-[11px] text-gray-500">{nota}</p>}
    </div>
  );
}

function Chip({ tono: t, children }: { tono: 'gris' | 'ambar' | 'rojo'; children: ReactNode }) {
  const c = t === 'ambar' ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : t === 'rojo' ? 'bg-red-50 text-red-700 ring-red-200'
    : 'bg-gray-100 text-gray-600 ring-gray-200';
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${c}`}>{children}</span>;
}
