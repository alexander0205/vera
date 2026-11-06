'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Search, UserRound } from 'lucide-react';
import { esSinCurso, titulo, type Alumno, type Grupo } from './_compartido';

/**
 * La migración de un colegio alumno por alumno, como el formulario de Jelisa:
 * a la izquierda el colegio en árbol (nivel → curso → alumno) con cuántos van
 * completados; a la derecha el alumno abierto, paso a paso. Reusa EditorAlumno
 * y el mismo estado del lote: no es otro camino para matricular.
 */

export type Completados = Map<number, { en: string; por: string | null }>;

const claveNivel = (g: Grupo) => `${g.servicio}${g.tanda ? ` (${g.tanda})` : ''}`;

export function VistaFormulario({
  grupos, todos, editandoId, fuera, completados, editor,
  busqueda, onBusqueda, filtros, filtro, onFiltro, onAbrir, onIncluir,
}: {
  /** Lo que queda tras buscar y filtrar. */
  grupos: Grupo[];
  /** Todo el colegio: los conteos «hechos de total» no cambian al buscar. */
  todos: Grupo[];
  editandoId: number | null;
  fuera: Set<number>;
  completados: Completados;
  editor: ReactNode;
  busqueda: string;
  onBusqueda: (q: string) => void;
  filtros: Array<{ id: string; etiqueta: string; n: number }>;
  filtro: string;
  onFiltro: (f: string) => void;
  onAbrir: (alumno: Alumno, grupo: Grupo) => void;
  onIncluir: (alumnoId: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [curso, setCurso] = useState<number | null>(null);
  const [nivelesAbiertos, setNivelesAbiertos] = useState<Set<string>>(new Set());
  const [cursosAbiertos, setCursosAbiertos] = useState<Set<number>>(new Set());

  // En una pantalla estrecha, el formulario pasa encima de la lista al abrir
  // un alumno. Se muestra de inmediato, sin tener que bajar tras 79 nombres.
  useEffect(() => {
    if (editandoId != null && window.matchMedia('(max-width: 1023px)').matches) {
      panelRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [editandoId]);

  const hecho = (id: number) => completados.has(id);
  const todosAlumnos = useMemo(() => todos.flatMap((g) => g.estudiantes.map((e) => ({ e, g }))), [todos]);
  const total = todosAlumnos.length;
  const hechos = todosAlumnos.filter(({ e }) => hecho(e.id)).length;
  const abierto = todosAlumnos.find(({ e }) => e.id === editandoId) ?? null;
  // El siguiente que falta, en el orden del árbol, para seguir sin buscarlo.
  const siguiente = useMemo(() => {
    const desde = abierto ? todosAlumnos.indexOf(abierto) : -1;
    const pendientes = (x: { e: Alumno }) => !completados.has(x.e.id) && !fuera.has(x.e.id) && x.e.id !== editandoId;
    return todosAlumnos.slice(desde + 1).find(pendientes) ?? todosAlumnos.find(pendientes) ?? null;
  }, [todosAlumnos, abierto, completados, fuera, editandoId]);

  const visibles = curso == null ? grupos : grupos.filter((g) => g.cursoId === curso);
  // Buscando o filtrando, todo lo que coincide se ve abierto.
  const forzar = busqueda.trim() !== '' || filtro !== 'todos' || curso != null;
  const niveles = useMemo(() => {
    const m = new Map<string, Grupo[]>();
    for (const g of visibles) m.set(claveNivel(g), [...(m.get(claveNivel(g)) ?? []), g]);
    return [...m.entries()];
  }, [visibles]);
  const nivelesTodos = useMemo(() => {
    const m = new Map<string, Grupo[]>();
    for (const g of todos) m.set(claveNivel(g), [...(m.get(claveNivel(g)) ?? []), g]);
    return m;
  }, [todos]);
  // El curso del alumno que se abre queda abierto al cerrarlo: se sigue con el de al lado.
  useEffect(() => {
    if (!abierto) return;
    setNivelesAbiertos((s) => (s.has(claveNivel(abierto.g)) ? s : new Set(s).add(claveNivel(abierto.g))));
    setCursosAbiertos((s) => (s.has(abierto.g.cursoId) ? s : new Set(s).add(abierto.g.cursoId)));
  }, [abierto]);
  const nivelAbierto = (n: string) => forzar || nivelesAbiertos.has(n) || (abierto != null && claveNivel(abierto.g) === n);
  const cursoAbierto = (g: Grupo) => forzar || cursosAbiertos.has(g.cursoId) || abierto?.g.cursoId === g.cursoId;
  const alternar = <T,>(set: (f: (s: Set<T>) => Set<T>) => void, k: T) =>
    set((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cuenta = (alumnos: Alumno[], enNivel = false) => {
    const dn = alumnos.filter((e) => hecho(e.id)).length;
    const lleno = dn === alumnos.length && alumnos.length > 0;
    return (
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        enNivel ? 'bg-white/20 text-inherit' : lleno ? 'bg-zero-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
        {dn}/{alumnos.length}
      </span>
    );
  };

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(300px,370px)_minmax(0,1fr)] lg:items-start">
      <aside className={`${editandoId == null ? 'order-1' : 'order-2'} rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:order-1`}
        aria-label="Estudiantes">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 px-2 py-2">
          <Anillo parte={total ? hechos / total : 0} />
          <p className="text-sm text-gray-700"><b className="font-semibold text-gray-900">{hechos} de {total}</b> estudiantes completados</p>
        </div>
        <h2 className="text-base font-semibold text-gray-900">Estudiantes</h2>
        <p className="mb-2 text-xs text-gray-500">
          Vienen de SIGERD y de Zero. Usa «Llenar» para empezar y «Modificar» para cambiar uno ya completado.
        </p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={busqueda} onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar estudiante por nombre" aria-label="Buscar estudiante por nombre"
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <select value={curso ?? ''} onChange={(e) => setCurso(e.target.value ? Number(e.target.value) : null)}
            aria-label="Filtrar por curso"
            className="h-9 min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:border-zero-500 focus:outline-none">
            <option value="">Todos los cursos ({total})</option>
            {[...nivelesTodos.entries()].map(([n, gs]) => (
              <optgroup key={n} label={n}>
                {gs.map((g) => (
                  <option key={g.cursoId} value={g.cursoId}>
                    {titulo(g)} ({g.estudiantes.filter((e) => hecho(e.id)).length}/{g.estudiantes.length})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select value={filtro} onChange={(e) => onFiltro(e.target.value)} aria-label="Mostrar"
            className="h-9 min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:border-zero-500 focus:outline-none">
            {filtros.map((f) => <option key={f.id} value={f.id}>{f.etiqueta} ({f.n})</option>)}
          </select>
        </div>
        {!forzar && (
          <div className="mb-2 flex gap-1">
            <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-zero-700 hover:bg-zero-50"
              onClick={() => { setNivelesAbiertos(new Set(nivelesTodos.keys())); setCursosAbiertos(new Set(todos.map((g) => g.cursoId))); }}>
              Abrir todos
            </button>
            <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-zero-700 hover:bg-zero-50"
              onClick={() => { setNivelesAbiertos(new Set()); setCursosAbiertos(new Set()); }}>
              Cerrar todos
            </button>
          </div>
        )}

        {niveles.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-gray-500">Ningún estudiante coincide con la búsqueda.</p>
        ) : (
          <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-[calc(100vh-330px)]">
            {niveles.map(([n, gs]) => {
              const ab = nivelAbierto(n);
              const delNivel = nivelesTodos.get(n) ?? gs;
              return (
                <li key={n}>
                  <button type="button" aria-expanded={ab} onClick={() => alternar(setNivelesAbiertos, n)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      ab ? 'border-zero-600 bg-zero-600 text-white' : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'}`}>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${ab ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{n}</span>
                      <span className={`block text-[11px] ${ab ? 'text-white/80' : 'text-gray-500'}`}>
                        {delNivel.length} curso(s), {delNivel.reduce((s, g) => s + g.estudiantes.length, 0)} estudiantes
                      </span>
                    </span>
                    {cuenta(delNivel.flatMap((g) => g.estudiantes), ab)}
                  </button>
                  {ab && (
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {gs.map((g) => {
                        const ca = cursoAbierto(g);
                        const completo = todos.find((x) => x.cursoId === g.cursoId) ?? g;
                        return (
                          <li key={g.cursoId}>
                            <button type="button" aria-expanded={ca} onClick={() => alternar(setCursosAbiertos, g.cursoId)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50">
                              <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${ca ? 'rotate-90' : ''}`} />
                              <span className="min-w-0 flex-1 truncate">{titulo(g)}</span>
                              {cuenta(completo.estudiantes)}
                            </button>
                            {ca && (
                              <ul className="ml-3 border-l border-gray-100 pl-2">
                                {g.estudiantes.map((e) => (
                                  <FilaAlumno key={e.id} e={e} activo={editandoId === e.id} hecho={hecho(e.id)}
                                    excluido={fuera.has(e.id)} sinCurso={esSinCurso(g)}
                                    onAbrir={() => onAbrir(e, g)} onIncluir={() => onIncluir(e.id)} />
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section ref={panelRef} className={`${editandoId == null ? 'order-2' : 'order-1'} min-w-0 scroll-mt-16 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:order-2`}
        aria-label="Formulario del estudiante">
        {editor ? (
          <div className="flex h-[min(82vh,900px)] min-h-[540px] flex-col">{editor}</div>
        ) : (
          <div className="flex min-h-[380px] flex-col items-center justify-center px-6 py-12 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zero-50 text-zero-600">
              <UserRound className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">
              {hechos > 0 ? 'Siga con el próximo estudiante' : 'Empiece con el primer estudiante'}
            </h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Elija un curso y luego un estudiante. Por cada uno indicará los padres y el responsable de pago,
              lo que se le cobra este año y lo que ya pagó, y al final lo revisa.
            </p>
            {siguiente && (
              <button type="button" onClick={() => onAbrir(siguiente.e, siguiente.g)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-zero-600 px-5 py-2 text-sm font-semibold text-white hover:bg-zero-700">
                Llenar: {siguiente.e.nombre}
              </button>
            )}
            {!siguiente && total > 0 && hechos === total && (
              <p className="mt-4 text-sm font-medium text-emerald-700">Todos los estudiantes están completados.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function FilaAlumno({ e, activo, hecho, excluido, sinCurso, onAbrir, onIncluir }: {
  e: Alumno; activo: boolean; hecho: boolean; excluido: boolean; sinCurso: boolean; onAbrir: () => void; onIncluir: () => void;
}) {
  const estado = excluido ? 'No se matricula ahora'
    : sinCurso ? 'Sin curso: elígele uno'
    : e.matriculaId != null ? 'Ya matriculado' : 'Por matricular';
  return (
    <li className={`flex items-start gap-2 rounded-lg px-2 py-2 ${activo ? 'bg-zero-50 ring-1 ring-inset ring-zero-300' : ''}`}>
      <span title={hecho ? 'Completado' : 'Pendiente'}
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${hecho ? 'border-zero-600 bg-zero-600' : 'border-gray-300'}`} />
      <button type="button" onClick={onAbrir} aria-pressed={activo} className="min-w-0 flex-1 text-left">
        <span className={`block text-sm leading-snug ${excluido ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}`}>{e.nombre}</span>
        <span className="block font-mono text-[10px] text-gray-400">{e.rne || 'Sin RNE'}</span>
        <span className="block text-[11px] text-gray-500">
          {e.origen && (
            // De dónde sale su sección: el portal, o Zero (su matrícula o el curso elegido aquí).
            <span className={`mr-1 rounded px-1 py-px text-[10px] font-semibold ${e.origen === 'sigerd'
              ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>
              {e.origen === 'sigerd' ? 'SIGERD' : 'Zero'}
            </span>
          )}
          {estado}
          {e.sinResponsable && !excluido && <span className="font-medium text-amber-700"> · Sin responsable</span>}
        </span>
      </button>
      {excluido ? (
        <button type="button" onClick={onIncluir}
          className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-zero-700 hover:bg-zero-50">
          Incluir
        </button>
      ) : (
        <button type="button" onClick={onAbrir}
          className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold ${hecho
            ? 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
            : 'bg-zero-600 text-white hover:bg-zero-700'}`}>
          {hecho ? 'Modificar' : 'Llenar'}
        </button>
      )}
    </li>
  );
}

function Anillo({ parte }: { parte: number }) {
  const C = 2 * Math.PI * 15;
  return (
    <svg viewBox="0 0 38 38" className="h-9 w-9 shrink-0" aria-hidden="true">
      <circle cx="19" cy="19" r="15" fill="none" className="stroke-gray-200" strokeWidth="5" />
      <circle cx="19" cy="19" r="15" fill="none" className="stroke-zero-600" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${C * parte} ${C}`} transform="rotate(-90 19 19)" />
    </svg>
  );
}
