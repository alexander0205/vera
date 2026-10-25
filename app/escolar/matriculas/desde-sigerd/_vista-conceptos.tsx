'use client';

import { useMemo, useState } from 'react';
import { Check, GraduationCap, Loader2, Plus, Search } from 'lucide-react';
import { cuentaDeConcepto } from '@/lib/administracion-escolar/matricular-sigerd-plan';
import type { LineaPlan } from '@/components/administracion-escolar/PlanCobroSelector';
import { fmtDOP } from '@/lib/utils/format';
import {
  esMatriculado, norm, precioDeLinea, titulo,
  type Ajuste, type Grupo, type PlanSeccion,
} from './_compartido';

interface ConceptoCatalogo {
  conceptoId: number;
  nombre: string;
  opcional: boolean;
  /** El precio como se lee si es el mismo en todas las secciones; si no, `null`. */
  precio: string | null;
  /** Alumnos que se matriculan en secciones con tarifa de este concepto. */
  aplican: number;
  tienen: number;
}

/**
 * Un concepto a la vez y quién lo lleva, sección por sección: para lo que no
 * lleva todo el mundo (almuerzo, horario extendido, una excursión). Tocar un
 * nombre le da o le quita el concepto; «Todos» y «Ninguno» lo hacen con la
 * sección entera, igual que los chips de la vista por sección.
 */
export function VistaConceptos({
  grupos, completos, planes, fuera, ajustes, conceptosDe, corte, onFijarAlumno, onFijarSeccion,
}: {
  /** Los grupos ya filtrados por la búsqueda y los filtros. */
  grupos: Grupo[];
  /** Cada sección entera, para «Todos» y «Ninguno». */
  completos: Map<number, Grupo>;
  planes: Map<number, PlanSeccion>;
  fuera: Set<number>;
  ajustes: Map<number, Ajuste>;
  conceptosDe: (alumnoId: number, cursoId: number) => number[] | null;
  corte: string;
  onFijarAlumno: (alumnos: { id: number; cursoId: number }[], conceptoId: number, cobrar: boolean) => void;
  onFijarSeccion: (grupo: Grupo, conceptoId: number, cobrar: boolean) => void;
}) {
  const [elegido, setElegido] = useState<number | null>(null);
  const [buscar, setBuscar] = useState('');

  const catalogo = useMemo(() => {
    const m = new Map<number, ConceptoCatalogo & { precios: Set<string> }>();
    for (const g of grupos) {
      const p = planes.get(g.cursoId);
      if (p?.estado !== 'listo') continue;
      for (const l of p.lineas) {
        const c = m.get(l.conceptoId) ?? {
          conceptoId: l.conceptoId, nombre: l.nombre, opcional: !!l.opcional,
          precio: null, aplican: 0, tienen: 0, precios: new Set<string>(),
        };
        c.precios.add(precioDeLinea(l));
        for (const e of g.estudiantes) {
          if (fuera.has(e.id)) continue;
          c.aplican++;
          if (conceptosDe(e.id, g.cursoId)?.includes(l.conceptoId)) c.tienen++;
        }
        m.set(l.conceptoId, c);
      }
    }
    return [...m.values()]
      .map(({ precios, ...c }) => ({ ...c, precio: precios.size === 1 ? [...precios][0] : null }))
      .sort((a, b) => Number(b.opcional) - Number(a.opcional) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [grupos, planes, fuera, conceptosDe]);

  const actual = catalogo.find((c) => c.conceptoId === elegido)
    ?? catalogo.find((c) => c.opcional) ?? catalogo[0] ?? null;

  const cargando = grupos.filter((g) => planes.get(g.cursoId)?.estado === 'cargando').length;
  const q = norm(buscar.trim());
  const enLista = catalogo.filter((c) => !q || norm(c.nombre).includes(q));
  const listas = [
    { titulo: 'Opcionales', items: enLista.filter((c) => c.opcional) },
    { titulo: 'Los lleva toda la sección', items: enLista.filter((c) => !c.opcional) },
  ].filter((x) => x.items.length > 0);

  // Las secciones donde el concepto tiene tarifa, con lo que se le carga a cada quien.
  const detalle = useMemo(() => {
    if (!actual) return null;
    const secciones: { g: Grupo; linea: LineaPlan; precio: string; tienen: number; dentro: number }[] = [];
    const sinTarifa: Grupo[] = [];
    let hoy = 0, anio = 0;
    for (const g of grupos) {
      const p = planes.get(g.cursoId);
      if (p?.estado !== 'listo') continue;
      const linea = p.lineas.find((l) => l.conceptoId === actual.conceptoId);
      if (!linea) { sinTarifa.push(g); continue; }
      let tienen = 0, dentro = 0;
      for (const e of g.estudiantes) {
        if (fuera.has(e.id)) continue;
        dentro++;
        if (!conceptosDe(e.id, g.cursoId)?.includes(actual.conceptoId)) continue;
        tienen++;
        // Lo que se carga es de los que se van a matricular: al matriculado ya se le cargó.
        if (esMatriculado(e)) continue;
        const c = cuentaDeConcepto(linea, ajustes.get(e.id)?.precios ?? [], corte);
        hoy += c.hoy;
        anio += c.anio;
      }
      secciones.push({ g, linea, precio: precioDeLinea(linea), tienen, dentro });
    }
    return { secciones, sinTarifa, hoy, anio };
  }, [actual, grupos, planes, fuera, ajustes, conceptosDe, corte]);

  if (catalogo.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
        {cargando > 0 ? <><Loader2 className="h-4 w-4 animate-spin" />Calculando lo que cobra cada sección…</> : 'Ningún alumno coincide.'}
      </p>
    );
  }

  const darATodos = (cobrar: boolean) => {
    if (!actual || !detalle) return;
    for (const { g } of detalle.secciones) {
      const completo = completos.get(g.cursoId);
      if (completo) onFijarSeccion(completo, actual.conceptoId, cobrar);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="self-start overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-4">
        <div className="border-b border-gray-100 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar un concepto…"
              aria-label="Buscar un concepto"
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
          </div>
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto pb-2">
          {listas.map((lista) => (
            <div key={lista.titulo}>
              <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-gray-500">{lista.titulo}</p>
              {lista.items.map((c) => {
                const activo = actual?.conceptoId === c.conceptoId;
                const pct = c.aplican ? Math.round((c.tienen * 100) / c.aplican) : 0;
                return (
                  <button key={c.conceptoId} type="button" onClick={() => setElegido(c.conceptoId)} aria-pressed={activo}
                    className={`flex w-full flex-col gap-1.5 px-4 py-2.5 text-left transition-colors ${activo ? 'bg-zero-50' : 'hover:bg-gray-50'}`}>
                    <span className="flex w-full items-baseline justify-between gap-2">
                      <span className={`text-[13px] font-medium ${activo ? 'text-zero-800' : 'text-gray-900'}`}>{c.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-600">{c.tienen} de {c.aplican}</span>
                    </span>
                    <span className="flex w-full items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span className={`block h-full rounded-full ${c.opcional ? 'bg-zero-600' : 'bg-zero-300'}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{c.precio ?? 'varía por sección'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {listas.length === 0 && <p className="px-4 py-6 text-center text-xs text-gray-500">Ningún concepto se llama así.</p>}
        </div>
      </aside>

      {actual && detalle && (
        <div className="min-w-0 space-y-3">
          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{actual.nombre}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">{actual.opcional ? 'Opcional' : 'Lo lleva toda la sección'}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">{actual.precio ?? 'El precio varía por sección'}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">{detalle.secciones.length} sección(es)</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => darATodos(true)}
                  title="Cobrárselo a todos los alumnos de las secciones que lo tienen"
                  className="h-9 rounded-lg border border-zero-200 bg-zero-50 px-3 text-sm font-medium text-zero-800 hover:bg-zero-100">
                  Dar a todos
                </button>
                <button type="button" onClick={() => darATodos(false)}
                  title="Que no se le cobre a nadie"
                  className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Quitar a todos
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-100">
              <div className="px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Lo llevan</p>
                <p className="text-base font-semibold tabular-nums text-gray-900">{actual.tienen} de {actual.aplican}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500" title="De los que se van a matricular">Se carga hoy al matricular</p>
                <p className="text-base font-semibold tabular-nums text-gray-900">{fmtDOP(detalle.hoy)}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500" title="De los que se van a matricular">En el año (nuevos)</p>
                <p className="text-base font-semibold tabular-nums text-gray-900">{fmtDOP(detalle.anio)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Toca un nombre para darle o quitarle el concepto. Los que tienen precio propio salen en ámbar.
            </p>
          </section>

          {cargando > 0 && (
            <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Calculando {cargando} sección(es) más…</p>
          )}

          {detalle.secciones.map(({ g, linea, precio, tienen, dentro }) => {
            const completo = completos.get(g.cursoId);
            return (
              <article key={g.cursoId} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <header className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{titulo(g)}</h3>
                    <p className="text-xs text-gray-500">{g.tanda ? `${g.tanda} · ` : ''}{precio} aquí</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    tienen === 0 ? 'bg-gray-100 text-gray-600' : tienen === dentro ? 'bg-zero-600 text-white' : 'bg-zero-50 text-zero-700'}`}>
                    {tienen} de {dentro}
                  </span>
                  {completo && (
                    <>
                      <button type="button" onClick={() => onFijarSeccion(completo, actual.conceptoId, true)}
                        title={`Cobrárselo a toda ${titulo(g)}`}
                        className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:border-zero-300 hover:text-zero-700">
                        Todos
                      </button>
                      <button type="button" onClick={() => onFijarSeccion(completo, actual.conceptoId, false)}
                        title={`Que nadie de ${titulo(g)} lo lleve`}
                        className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:border-gray-300">
                        Ninguno
                      </button>
                    </>
                  )}
                </header>
                <div className="flex flex-wrap gap-2 p-4">
                  {g.estudiantes.map((e) => {
                    const sale = fuera.has(e.id);
                    const tiene = !sale && !!conceptosDe(e.id, g.cursoId)?.includes(actual.conceptoId);
                    const propio = tiene ? ajustes.get(e.id)?.precios.find((p) => p.conceptoId === actual.conceptoId) : undefined;
                    const matriculado = esMatriculado(e);
                    return (
                      <button key={e.id} type="button" disabled={sale} aria-pressed={tiene}
                        onClick={() => onFijarAlumno([{ id: e.id, cursoId: g.cursoId }], actual.conceptoId, !tiene)}
                        title={`${sale ? 'No se matricula ahora' : tiene ? `Quitarle ${actual.nombre}` : `Darle ${actual.nombre}`}${matriculado ? ' (ya matriculado: se guarda en su matrícula)' : ''}`}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${
                          sale ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-50 text-gray-400 line-through'
                            : propio ? 'border-amber-400 bg-amber-50 font-medium text-amber-900 hover:bg-amber-100'
                            : tiene ? 'border-zero-600 bg-zero-50 font-medium text-zero-800 hover:bg-zero-100'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-zero-300 hover:text-zero-700'}`}>
                        {tiene ? <Check className="h-3.5 w-3.5" /> : !sale && <Plus className="h-3.5 w-3.5" />}
                        {e.nombre}
                        {matriculado && <GraduationCap className="h-3.5 w-3.5 opacity-60" aria-label="ya matriculado" />}
                        {propio && <span className="text-xs tabular-nums">{precioDeLinea(linea, propio.montoCentavos)}</span>}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}

          {detalle.sinTarifa.length > 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-600">
              No se cobra en {detalle.sinTarifa.map((g) => titulo(g)).join(', ')}: esas secciones no tienen tarifa de este concepto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
