'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, Pencil, RotateCcw, UserMinus } from 'lucide-react';
import { Paginador } from '@/components/ui/paginador';
import { fmtDOP } from '@/lib/utils/format';
import {
  Chip, cobraEnSeccion, esMatriculado, iniciales, precioDeLinea, tono, titulo,
  type Ajuste, type Alumno, type Cuenta, type Grupo, type PlanSeccion,
} from './_compartido';

type Orden = 'grado' | 'nombre' | 'hoy';
const POR_PAGINA = 50;
const COLUMNAS = 'grid grid-cols-[28px_minmax(220px,1.2fr)_170px_minmax(280px,2fr)_110px_110px_168px] items-center gap-3';

/**
 * Todos los alumnos en una sola tabla, cada uno con lo que lleva. Aquí se
 * marcan varios para cambiarlos juntos (la barra de arriba) y «Editar» abre su
 * plan debajo de la fila, sin salir de la lista.
 */
export function VistaAlumnos({
  grupos, planes, cambiadosSeccion, fuera, ajustes, cuentas, conceptosDe,
  seleccion, onMarcar, editandoId, editor, onEditar, onSacar, onIncluir, onDeshacer,
}: {
  /** Los grupos ya filtrados por la búsqueda y los filtros. */
  grupos: Grupo[];
  planes: Map<number, PlanSeccion>;
  cambiadosSeccion: Map<number, Set<number>>;
  fuera: Set<number>;
  ajustes: Map<number, Ajuste>;
  cuentas: Map<number, Cuenta>;
  conceptosDe: (alumnoId: number, cursoId: number) => number[] | null;
  seleccion: Set<number>;
  onMarcar: (ids: number[], marcar: boolean) => void;
  editandoId: number | null;
  /** El plan del alumno que se está editando, para ponerlo debajo de su fila. */
  editor: ReactNode;
  onEditar: (alumno: Alumno, cursoId: number) => void;
  onSacar: (id: number) => void;
  onIncluir: (id: number) => void;
  onDeshacer: (id: number) => void;
}) {
  const [orden, setOrden] = useState<Orden>('grado');
  const [pagina, setPagina] = useState(1);

  const filas = useMemo(() => {
    const todas = grupos.flatMap((g) => g.estudiantes.map((e) => ({ e, g })));
    if (orden === 'nombre') return [...todas].sort((a, b) => a.e.nombre.localeCompare(b.e.nombre, 'es'));
    if (orden === 'hoy') {
      // Los ya matriculados no cargan nada nuevo: van al final, con los que no se matriculan.
      const hoy = (id: number) => (fuera.has(id) ? -1 : cuentas.get(id)?.hoy ?? -1);
      return [...todas].sort((a, b) => hoy(b.e.id) - hoy(a.e.id));
    }
    return todas;
  }, [grupos, orden, cuentas, fuera]);

  // Si la lista se acorta (un filtro, una búsqueda) la página se queda en la última que existe.
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const enPagina = filas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);
  const idsPagina = enPagina.map((f) => f.e.id);
  const marcadosPagina = idsPagina.filter((id) => seleccion.has(id)).length;
  const todaLaPagina = idsPagina.length > 0 && marcadosPagina === idsPagina.length;

  const cabecera = (campo: Orden, texto: string, alinear = 'text-left') => (
    <button type="button" onClick={() => setOrden(campo)}
      title={`Ordenar por ${texto.toLowerCase()}`}
      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-900 ${alinear} ${orden === campo ? 'text-gray-900' : ''}`}>
      {texto}{orden === campo && <ArrowDown className="h-3 w-3" />}
    </button>
  );

  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
        Ningún alumno coincide.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {todaLaPagina && filas.length > idsPagina.length && seleccion.size < filas.length && (
        <div className="border-b border-zero-100 bg-zero-50 px-4 py-2 text-center text-xs text-zero-800">
          Marcaste los {idsPagina.length} de esta página.{' '}
          <button type="button" onClick={() => onMarcar(filas.map((f) => f.e.id), true)}
            className="font-semibold underline-offset-2 hover:underline">
            Marcar los {filas.length} de la lista
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className={`${COLUMNAS} border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500`}>
            <input type="checkbox" checked={todaLaPagina}
              ref={(el) => { if (el) el.indeterminate = marcadosPagina > 0 && !todaLaPagina; }}
              onChange={() => onMarcar(idsPagina, !todaLaPagina)}
              aria-label="Marcar a todos los de esta página"
              className="h-4 w-4 accent-zero-600" />
            {cabecera('nombre', 'Alumno')}
            {cabecera('grado', 'Grado y sección')}
            <span>Lo que lleva</span>
            <span className="flex justify-end">{cabecera('hoy', 'Hoy', 'text-right')}</span>
            <span className="text-right">En el año</span>
            <span />
          </div>

          {enPagina.map(({ e, g }) => {
            const sale = fuera.has(e.id);
            const marcado = seleccion.has(e.id);
            const abierto = editandoId === e.id;
            const plan = planes.get(g.cursoId);
            const suyos = new Set(conceptosDe(e.id, g.cursoId) ?? []);
            // Lo de otros grados sale solo si lo lleva (se le dio en «Ver más»).
            const lineas = plan?.estado === 'listo'
              ? [...plan.lineas, ...plan.otros.filter((l) => suyos.has(l.conceptoId))] : [];
            const propios = new Map((ajustes.get(e.id)?.precios ?? []).map((p) => [p.conceptoId, p.montoCentavos]));
            const cambiados = cambiadosSeccion.get(g.cursoId);
            const c = cuentas.get(e.id);
            const matriculado = esMatriculado(e);
            return (
              <Fragment key={e.id}>
                <div className={`${COLUMNAS} border-t border-gray-100 px-4 py-2.5 first:border-t-0 ${
                  abierto ? 'bg-zero-50/60' : marcado ? 'bg-zero-50' : sale ? 'bg-gray-50' : 'hover:bg-gray-50/70'}`}>
                  <input type="checkbox" checked={marcado}
                    onChange={() => onMarcar([e.id], !marcado)}
                    aria-label={`Marcar a ${e.nombre}`}
                    className="h-4 w-4 accent-zero-600" />
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${sale ? 'bg-gray-200 text-gray-400' : tono(e.id)}`}>
                      {iniciales(e.nombre)}
                    </span>
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${sale ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.nombre}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {sale && <Chip tono="gris">No se matricula ahora</Chip>}
                        {matriculado && <Chip tono="azul">Matriculado</Chip>}
                        {!sale && ajustes.has(e.id) && <Chip tono="verde">{matriculado ? 'Cambios por guardar' : 'Plan cambiado'}</Chip>}
                        {!sale && e.sinResponsable && <Chip tono="ambar">Sin responsable</Chip>}
                      </div>
                    </div>
                  </div>
                  <span className="truncate text-[13px] text-gray-700" title={titulo(g)}>{titulo(g)}</span>
                  <div className="flex flex-wrap gap-1">
                    {plan?.estado === 'cargando' && <span className="text-xs text-gray-400">Calculando…</span>}
                    {!sale && lineas.map((l) => {
                      if (suyos.has(l.conceptoId)) {
                        const propio = propios.get(l.conceptoId);
                        return propio != null
                          ? <Chip key={l.conceptoId} tono="ambar">{l.nombre} {precioDeLinea(l, propio)}</Chip>
                          : <Chip key={l.conceptoId} tono={l.opcional ? 'azul' : 'gris'}>{l.nombre}</Chip>;
                      }
                      if (!cobraEnSeccion(l, cambiados)) return null;
                      return (
                        <span key={l.conceptoId} title="Su sección lo cobra, a este alumno no"
                          className="inline-flex items-center rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-500">
                          Sin {l.nombre}
                        </span>
                      );
                    })}
                  </div>
                  {matriculado ? (
                    <span className="text-right text-xs text-gray-400" title="Lo suyo se cargó al matricularlo">ya matriculado</span>
                  ) : (
                    <span className="text-right text-sm tabular-nums text-gray-900">{sale ? '—' : c ? fmtDOP(c.hoy) : '…'}</span>
                  )}
                  <span className="text-right text-[13px] tabular-nums text-gray-500">{sale || !c ? '' : fmtDOP(c.anio)}</span>
                  <div className="flex items-center justify-end gap-1">
                    {sale ? (
                      <button type="button" onClick={() => onIncluir(e.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zero-700 hover:bg-zero-50">
                        <RotateCcw className="h-3.5 w-3.5" />Incluir
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => onEditar(e, g.cursoId)}
                          disabled={plan?.estado !== 'listo'} aria-expanded={abierto}
                          title={abierto ? 'Cerrar su plan' : 'Ver y cambiar sus conceptos y precios aquí mismo'}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-40 ${
                            abierto ? 'border-zero-600 bg-zero-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-zero-300 hover:text-zero-700'}`}>
                          <Pencil className="h-3.5 w-3.5" />{abierto ? 'Cerrar' : 'Editar'}
                        </button>
                        {ajustes.has(e.id) && (
                          <button type="button" onClick={() => onDeshacer(e.id)}
                            title={matriculado ? 'Deshacer los cambios: queda como su matrícula' : 'Deshacer los cambios: vuelve a lo de su sección'}
                            aria-label={`Deshacer los cambios de ${e.nombre}`}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        {!matriculado && (
                          <button type="button" onClick={() => onSacar(e.id)}
                            title="No matricular a este alumno ahora" aria-label={`No matricular a ${e.nombre}`}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <UserMinus className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {abierto && (
                  <div className="border-y border-zero-100 bg-zero-50/40 px-4 py-4 sm:pl-12">
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">{editor}</div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      <Paginador pagina={actual} paginas={paginas} total={filas.length} porPagina={POR_PAGINA} onCambiar={setPagina} />
    </div>
  );
}
