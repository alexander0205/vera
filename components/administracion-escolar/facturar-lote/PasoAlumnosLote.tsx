'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  SIN_FILTRO, estadoDeLaCasilla, filtrarAlumnos, marcarVarios, opcionesDeGrado, opcionesDeSeccion,
  type AlumnoCatalogo, type FiltroAlumnos,
} from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';
import { textoDeCurso } from '@/lib/administracion-escolar/sin-grado';

/**
 * Paso 1 de «Facturar por lote»: a quiénes.
 *
 * Una casilla por alumno, con filtros por grado, sección y búsqueda, y una
 * casilla de cabecera que marca TODOS LOS FILTRADOS — no al colegio entero:
 * busca «Gómez», marca, y solo marcaste a los Gómez. Es el mismo criterio de la
 * lista de «Cobrar a un grupo», donde «marcar todos» sobre una búsqueda hecha
 * marcaba lo que no se veía.
 *
 * Cada fila dice cuánto tiene sin factura: con trescientos alumnos, saber quién
 * ya está al día ahorra marcar a ciegas. Y avisa en ámbar de quién no tiene
 * responsable de pago, porque a ese no hay a quién ponerle la factura y la
 * vista previa lo va a dejar fuera.
 *
 * No decide nada: pinta las marcas que le pasan y avisa de cada cambio.
 */

const CASILLA = 'h-4 w-4 shrink-0 accent-zero-600';

/**
 * Una fila. Va memoizada porque la lista puede tener mil alumnos y cada clic
 * crea un `Set` nuevo: sin esto, marcar a uno repintaba a los mil.
 */
const Fila = memo(function Fila({ a, marcado, onAlternar }: {
  a: AlumnoCatalogo;
  marcado: boolean;
  onAlternar: (id: number) => void;
}) {
  const curso = textoDeCurso(a.grado, a.seccion);
  const segunda = [curso, a.codigo].filter(Boolean).join(' · ');
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-gray-50 sm:py-2.5">
        <input type="checkbox" className={CASILLA} checked={marcado} onChange={() => onAlternar(a.estudianteId)} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${marcado ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{a.nombre}</span>
          <span className="block truncate text-xs text-gray-500">
            {segunda || 'Sin curso'}
            {a.responsable && <> · {a.responsable}</>}
          </span>
        </span>
        {a.responsableId == null && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" aria-hidden />Sin responsable
          </span>
        )}
        <span className={`shrink-0 text-right text-xs tabular-nums ${a.sinFactura > 0 ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
          {a.sinFactura > 0
            ? <>{a.sinFactura} {a.sinFactura === 1 ? 'cargo' : 'cargos'} · {fmtDOP(a.sinFacturaCentavos)}</>
            : 'Al día'}
        </span>
      </label>
    </li>
  );
});

export function PasoAlumnosLote({ alumnos, seleccion, onCambiar }: {
  alumnos: AlumnoCatalogo[];
  seleccion: Set<number>;
  onCambiar: (siguiente: Set<number>) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroAlumnos>(SIN_FILTRO);

  const grados = useMemo(() => opcionesDeGrado(alumnos), [alumnos]);
  const secciones = useMemo(() => opcionesDeSeccion(alumnos, filtro.gradoId), [alumnos, filtro.gradoId]);
  const visibles = useMemo(() => filtrarAlumnos(alumnos, filtro), [alumnos, filtro]);

  const estado = estadoDeLaCasilla(visibles, seleccion);
  const marcadosAlaVista = visibles.filter((a) => seleccion.has(a.estudianteId)).length;
  const hayFiltro = filtro.gradoId != null || filtro.texto.trim() !== '' || filtro.soloConPendientes;

  // La función que reciben las filas tiene que ser SIEMPRE la misma, o la
  // memoización de `Fila` no sirve de nada: cada clic cambia `seleccion`. Lee las
  // marcas de una referencia que se actualiza al pintar.
  const marcas = useRef(seleccion);
  useEffect(() => { marcas.current = seleccion; }, [seleccion]);
  const alternar = useCallback((id: number) => {
    onCambiar(marcarVarios(marcas.current, [id], !marcas.current.has(id)));
  }, [onCambiar]);

  const marcarTodos = () => {
    // Si ya están todos los filtrados, la casilla los quita; si no, los pone.
    onCambiar(marcarVarios(seleccion, visibles.map((a) => a.estudianteId), estado !== 'todos'));
  };

  return (
    <div className="space-y-3 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
          <Input className="pl-8" autoComplete="off"
            aria-label="Buscar alumno por nombre, código o responsable"
            placeholder="Buscar por nombre, código o responsable…"
            value={filtro.texto}
            onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))} />
        </div>
        <NativeSelect aria-label="Grado" className="sm:!w-52" value={filtro.gradoId ?? ''}
          onChange={(e) => setFiltro((f) => ({ ...f, gradoId: e.target.value ? Number(e.target.value) : null, cursoId: null }))}>
          <option value="">Todos los grados</option>
          {grados.map((g) => <option key={g.id} value={g.id}>{g.etiqueta}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Sección" className="sm:!w-36" value={filtro.cursoId ?? ''}
          disabled={filtro.gradoId == null}
          onChange={(e) => setFiltro((f) => ({ ...f, cursoId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">{filtro.gradoId == null ? 'Sección' : 'Todas las secciones'}</option>
          {secciones.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
        </NativeSelect>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" className={CASILLA} checked={filtro.soloConPendientes}
          onChange={(e) => setFiltro((f) => ({ ...f, soloConPendientes: e.target.checked }))} />
        Mostrar solo a los que tienen algo sin factura
      </label>

      {alumnos.length === 0 ? (
        <p className="rounded-lg border border-gray-200 px-3 py-4 text-sm text-gray-600">
          No hay alumnos matriculados en este año escolar.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          {/* La cabecera se queda arriba al bajar por la lista: es donde está
              «seleccionar todos» y el conteo, y se pierde si se va. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-800">
              <input type="checkbox" className={CASILLA}
                ref={(el) => { if (el) el.indeterminate = estado === 'algunos'; }}
                checked={estado === 'todos'} disabled={visibles.length === 0}
                onChange={marcarTodos}
                aria-label={hayFiltro ? 'Seleccionar todos los filtrados' : 'Seleccionar todos'} />
              {hayFiltro
                ? `Seleccionar todos los filtrados (${visibles.length})`
                : `Seleccionar todos (${visibles.length})`}
            </label>
            <span className="text-xs text-gray-600" aria-live="polite">
              {seleccion.size === 0
                ? 'Nadie marcado'
                : hayFiltro && marcadosAlaVista !== seleccion.size
                  ? `${marcadosAlaVista} a la vista · ${seleccion.size} marcados en total`
                  : `${seleccion.size} ${seleccion.size === 1 ? 'marcado' : 'marcados'}`}
            </span>
          </div>

          {visibles.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-600">
              Ningún alumno coincide con esos filtros.{' '}
              <button type="button" className="font-medium text-zero-600 hover:text-zero-800"
                onClick={() => setFiltro(SIN_FILTRO)}>
                Quitar los filtros
              </button>
            </p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto">
              {visibles.map((a) => (
                <Fila key={a.estudianteId} a={a} marcado={seleccion.has(a.estudianteId)} onAlternar={alternar} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
