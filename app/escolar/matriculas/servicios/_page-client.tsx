'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Download, Grid3x3, Loader2, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cambioParaPaquete, conceptosTrasCambio } from '@/lib/administracion-escolar/servicios-alumnos';
import { FiltroEstructura } from '@/components/administracion-escolar/FiltroEstructura';
import {
  completarFiltro, normalizarFiltro, seccionesDelFiltro, TODOS_LOS_CURSOS,
  type CursoFiltrable, type FiltroGrupo,
} from '@/lib/administracion-escolar/filtro-curso';

/**
 * «Servicios por alumno»: una fila por matrícula activa, una columna por
 * concepto. Se marcan y desmarcan casillas (una a una, por columna o por lote
 * con paquetes) y nada se guarda hasta «Guardar cambios»: así se revisa todo el
 * grupo antes de tocar lo que se le cobra a nadie.
 */

interface Concepto { id: number; nombre: string; opcional: boolean; categoria: string | null }
interface Paquete { id: number; nombre: string; conceptosIds: number[] }
interface Fila {
  matriculaId: number; estudianteId: number; nombre: string; codigo: string | null;
  grado: string; seccion: string; cursoId: number; gradoId: number; servicioId: number;
  conceptosIds: number[]; conTarifa: number[];
  beca: { tipo: string; valor: number | null } | null;
}
interface Datos { periodo: { id: number; nombre: string } | null; conceptos: Concepto[]; paquetes: Paquete[]; filas: Fila[] }

/** Lo pendiente por matrícula: qué se agrega y qué se quita respecto de lo guardado. */
type Pendiente = Map<number, { agregar: Set<number>; quitar: Set<number> }>;

const traer = (url: string) => fetch(url).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar');
  return j;
});

export default function ServiciosPorAlumno() {
  const { data, error, isLoading, mutate } = useSWR<Datos>('/api/administracion-escolar/matriculas/servicios', traer,
    { revalidateOnFocus: false });
  const [pendiente, setPendiente] = useState<Pendiente>(new Map());
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstr, setFiltroEstr] = useState<FiltroGrupo>(TODOS_LOS_CURSOS);
  const { data: cursosData } = useSWR<{ cursos: CursoFiltrable[] }>('/api/administracion-escolar/cursos', traer,
    { revalidateOnFocus: false });
  const [anular, setAnular] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const filas = data?.filas ?? [];
  const conceptos = data?.conceptos ?? [];
  const paquetes = data?.paquetes ?? [];

  /** Lo que tendría la matrícula si se guardara ahora. */
  const efectivo = (f: Fila) => {
    const p = pendiente.get(f.matriculaId);
    return p ? conceptosTrasCambio(f.conceptosIds, { agregar: [...p.agregar], quitar: [...p.quitar] }) : f.conceptosIds;
  };

  const cursos = useMemo(() => cursosData?.cursos ?? [], [cursosData]);
  const periodoId = data?.periodo?.id ?? null;
  // Por id y no por nombre: «Primero» de la tanda matutina y el de la
  // vespertina se fundían en uno, y «Sección A» traía la A de todos los grados.
  const visibles = useMemo(() => {
    const ids = seccionesDelFiltro(cursos, periodoId, normalizarFiltro(cursos, periodoId, completarFiltro(cursos, filtroEstr)));
    const dentro = ids ? new Set(ids) : null;
    const q = sinAcentos(busqueda.trim());
    return filas.filter((f) => (!dentro || dentro.has(f.cursoId))
      && (!q || sinAcentos(`${f.nombre} ${f.codigo ?? ''}`).includes(q)));
  }, [filas, cursos, periodoId, filtroEstr, busqueda]);
  // Lo marcado que sigue a la vista: un filtro que esconde a alguien no puede
  // dejar que el lote le cambie los servicios sin verlo.
  const seleccionVisible = useMemo(() => visibles.filter((f) => seleccion.has(f.matriculaId)), [visibles, seleccion]);

  /** Pone una casilla en el estado pedido, guardando solo la diferencia con lo que hay. */
  function poner(p: Pendiente, f: Fila, conceptoId: number, quiere: boolean) {
    if (!f.conTarifa.includes(conceptoId) && quiere) return;
    const tenia = f.conceptosIds.includes(conceptoId);
    const actual = p.get(f.matriculaId) ?? { agregar: new Set<number>(), quitar: new Set<number>() };
    actual.agregar.delete(conceptoId);
    actual.quitar.delete(conceptoId);
    if (quiere && !tenia) actual.agregar.add(conceptoId);
    if (!quiere && tenia) actual.quitar.add(conceptoId);
    if (actual.agregar.size + actual.quitar.size === 0) p.delete(f.matriculaId); else p.set(f.matriculaId, actual);
  }

  const cambiar = (fn: (p: Pendiente) => void) => setPendiente((prev) => {
    const n: Pendiente = new Map([...prev].map(([k, v]) => [k, { agregar: new Set(v.agregar), quitar: new Set(v.quitar) }]));
    fn(n);
    return n;
  });

  const objetivo = () => (seleccionVisible.length > 0 ? seleccionVisible : visibles);

  function aplicarPaquete(pq: Paquete) {
    cambiar((p) => {
      for (const f of objetivo()) {
        const c = cambioParaPaquete(f.conceptosIds, pq.conceptosIds, f.conTarifa);
        for (const id of conceptos.map((x) => x.id)) {
          if (c.agregar.includes(id)) poner(p, f, id, true);
          else if (c.quitar.includes(id)) poner(p, f, id, false);
          else poner(p, f, id, f.conceptosIds.includes(id));
        }
      }
    });
  }

  function columna(conceptoId: number, quiere: boolean) {
    cambiar((p) => { for (const f of objetivo()) poner(p, f, conceptoId, quiere); });
  }

  const nCambios = [...pendiente.values()].reduce((s, v) => s + v.agregar.size + v.quitar.size, 0);

  async function guardar() {
    if (!data?.periodo) return;
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch('/api/administracion-escolar/matriculas/servicios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodoId: data.periodo.id, anularSinFacturar: anular,
          cambios: [...pendiente].map(([matriculaId, v]) => ({ matriculaId, agregar: [...v.agregar], quitar: [...v.quitar] })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar.');
      const partes = [
        `${j.guardados} alumno(s) actualizados`,
        j.cargosCreados ? `${j.cargosCreados} cargo(s) creados` : null,
        j.anulados ? `${j.anulados} cargo(s) sin facturar anulados` : null,
        j.conError?.length ? `${j.conError.length} con error: ${j.conError[0].error}` : null,
      ].filter(Boolean).join(' · ');
      setAviso({ tono: j.conError?.length ? 'error' : 'ok', texto: partes });
      setPendiente(new Map());
      setSeleccion(new Set());
      await mutate();
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  async function subirExcel(file: File) {
    setSubiendo(true);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const r = await fetch('/api/administracion-escolar/matriculas/servicios/excel', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo leer el archivo.');
      cambiar((p) => {
        for (const c of j.cambios as { matriculaId: number; agregar: number[]; quitar: number[] }[]) {
          const f = filas.find((x) => x.matriculaId === c.matriculaId);
          if (!f) continue;
          for (const id of c.agregar) poner(p, f, id, true);
          for (const id of c.quitar) poner(p, f, id, false);
        }
      });
      setAviso({ tono: 'ok', texto: `Leído: ${j.cambios.length} alumno(s) con cambios${j.avisos?.length ? ` · ${j.avisos.length} aviso(s): ${j.avisos[0]}` : ''}. Revisa la cuadrícula y pulsa «Guardar cambios».` });
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  if (isLoading) return <p className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</p>;
  if (error) return <p className="p-6 text-sm text-red-600">{error.message}</p>;

  const todosVisibles = visibles.length > 0 && visibles.every((f) => seleccion.has(f.matriculaId));

  return (
    <section className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/escolar/matriculas" className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" />Matriculación
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900"><Grid3x3 className="h-5 w-5 text-zero-600" />Servicios por alumno</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
            Qué cobra cada alumno matriculado{data?.periodo ? ` en ${data.periodo.nombre}` : ''}. Marca o desmarca casillas, aplica un
            paquete o cambia una columna entera; nada se guarda hasta «Guardar cambios». Lo que se agrega crea ya las cuotas cuya fecha
            llegó; lo demás se cobra en su mes.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/administracion-escolar/matriculas/servicios/excel" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" />Descargar Excel
          </a>
          <input ref={archivo} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirExcel(f); }} />
          <Button variant="outline" onClick={() => archivo.current?.click()} disabled={subiendo}>
            {subiendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}Subir Excel
          </Button>
        </div>
      </div>

      {/* Filtros y acciones por lote */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar alumno o código…"
            className="h-9 w-56 rounded-md border border-gray-300 pl-8 pr-2 text-sm focus:border-zero-500 focus:outline-none" />
        </label>
        <FiltroEstructura cursos={cursos} periodoId={periodoId} filtro={filtroEstr} onChange={setFiltroEstr} className="h-9 w-44 text-sm" />
        <span className="mx-1 h-6 w-px bg-gray-200" />
        <span className="text-xs text-gray-500">
          {seleccionVisible.length > 0 ? `A ${seleccionVisible.length} seleccionado(s):` : `A los ${visibles.length} de la lista:`}
        </span>
        {paquetes.length > 0 && (
          <select value="" onChange={(e) => { const pq = paquetes.find((x) => x.id === Number(e.target.value)); if (pq) aplicarPaquete(pq); }}
            className="h-9 rounded-md border border-zero-200 bg-white px-2 text-sm text-zero-700">
            <option value="">Aplicar paquete…</option>
            {paquetes.map((pq) => <option key={pq.id} value={pq.id}>{pq.nombre}</option>)}
          </select>
        )}
        <select value="" onChange={(e) => { if (e.target.value) columna(Number(e.target.value), true); }}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
          <option value="">Agregar concepto…</option>
          {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value="" onChange={(e) => { if (e.target.value) columna(Number(e.target.value), false); }}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
          <option value="">Quitar concepto…</option>
          {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {aviso && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${aviso.tono === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </p>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No hay alumnos matriculados en este año escolar. Matricúlalos primero (por ejemplo, desde SIGERD).
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <th className="sticky left-0 z-20 w-9 border-b border-gray-200 bg-white px-3 py-2">
                  <input type="checkbox" aria-label="Seleccionar todos los de la lista" checked={todosVisibles}
                    onChange={() => setSeleccion(todosVisibles ? new Set() : new Set(visibles.map((f) => f.matriculaId)))}
                    className="h-4 w-4 accent-zero-600" />
                </th>
                <th className="sticky left-9 z-20 min-w-[220px] border-b border-gray-200 bg-white px-2 py-2 text-left font-medium">Alumno</th>
                <th className="border-b border-gray-200 px-2 py-2 text-left font-medium">Grado</th>
                {conceptos.map((c) => (
                  <th key={c.id} className="min-w-[96px] border-b border-gray-200 px-2 py-2 text-center align-bottom font-medium normal-case tracking-normal">
                    <span className="block text-xs leading-tight text-gray-700">{c.nombre}</span>
                    {c.opcional && <span className="block text-[10px] font-normal text-gray-400">opcional</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const tiene = efectivo(f);
                const sel = seleccion.has(f.matriculaId);
                return (
                  <tr key={f.matriculaId} className={sel ? 'bg-zero-50/50' : 'hover:bg-gray-50'}>
                    <td className="sticky left-0 border-b border-gray-100 bg-inherit px-3 py-1.5" style={{ background: 'inherit' }}>
                      <input type="checkbox" aria-label={`Seleccionar a ${f.nombre}`} checked={sel}
                        onChange={() => setSeleccion((s) => { const n = new Set(s); if (!n.delete(f.matriculaId)) n.add(f.matriculaId); return n; })}
                        className="h-4 w-4 accent-zero-600" />
                    </td>
                    <td className="sticky left-9 border-b border-gray-100 bg-white px-2 py-1.5">
                      <span className="block text-gray-900">{f.nombre}</span>
                      <span className="block text-[11px] text-gray-400">{f.codigo ?? '—'}{f.beca ? ` · beca ${f.beca.tipo === 'porcentaje' ? `${f.beca.valor}%` : ''}` : ''}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{f.grado} · {f.seccion}</td>
                    {conceptos.map((c) => {
                      const puede = f.conTarifa.includes(c.id);
                      const marcado = tiene.includes(c.id);
                      const p = pendiente.get(f.matriculaId);
                      const agrega = p?.agregar.has(c.id);
                      const quita = p?.quitar.has(c.id);
                      return (
                        <td key={c.id} className={`border-b border-gray-100 px-2 py-1.5 text-center ${agrega ? 'bg-emerald-50' : quita ? 'bg-red-50' : ''}`}>
                          {puede || marcado ? (
                            <input type="checkbox" checked={marcado} aria-label={`${c.nombre} para ${f.nombre}`}
                              onChange={() => cambiar((x) => poner(x, f, c.id, !marcado))}
                              className="h-4 w-4 cursor-pointer accent-zero-600" />
                          ) : (
                            <span className="text-xs text-gray-300" title="Su sección no tiene precio para este concepto">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nCambios > 0 && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zero-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm text-gray-700">
            <strong>{nCambios}</strong> cambio(s) en <strong>{pendiente.size}</strong> alumno(s)
            <span className="ml-2 text-xs text-gray-500">verde = se agrega · rojo = se quita</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={anular} onChange={(e) => setAnular(e.target.checked)} className="h-3.5 w-3.5 accent-zero-600" />
              Al quitar, anular sus cargos sin facturar ni pagar
            </label>
            <Button variant="outline" size="sm" onClick={() => setPendiente(new Map())} disabled={guardando}>Descartar</Button>
            <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Para buscar «Jose» y encontrar «José». */
function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
