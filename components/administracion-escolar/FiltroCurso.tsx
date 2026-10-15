'use client';

import { useMemo } from 'react';
import {
  preguntasDelFiltro,
  type ConteoAlumnos, type CursoFiltrable, type FiltroGrupo, type OpcionGrupo,
} from '@/lib/administracion-escolar/filtro-curso';

/**
 * Elegir a quién se le cobra: un grupo del colegio, el colegio entero o —con
 * las filas de más que pase la pantalla— los alumnos uno por uno.
 *
 * Fueron tres desplegables: Servicio, Grado y Sección. Funcionaban, pero había
 * que saber qué es un «servicio», abrir tres listas para ver qué había dentro,
 * y el primero venía puesto en «Todos los cursos»: sin tocar nada se revisaba
 * el colegio entero. Ahora es una lista con todo a la vista:
 *
 *  - cada grupo es una fila con su nombre de verdad («Primaria · Matutina») y
 *    cuántos alumnos tiene, que es lo que avisa de que se tocó donde no era;
 *  - nadie viene elegido: mientras `elegido` sea false no hay ninguna fila
 *    marcada;
 *  - dentro del grupo elegido se pregunta, con botones, si es todo o solo un
 *    curso o una sección. Lo que no tiene respuesta no se pregunta, y nada sale
 *    apagado.
 *
 * Se parece a `SelectorCurso` solo en que los dos recorren servicio → grado →
 * sección. Aquel es para MATRICULAR y hay que acabar en una sección; aquí
 * pararse en el servicio es una respuesta completa («cóbrale a toda la sala de
 * tareas»).
 *
 * No guarda nada por su cuenta. Cuando el filtro se montó sobre el selector de
 * matricular, el servicio a medio elegir vivía dentro del control y se
 * descartaba en el render siguiente: la elección se deshacía sola. Lo que se
 * ve aquí es exactamente lo que el padre tiene guardado, y qué preguntar lo
 * decide `preguntasDelFiltro`, que es puro y está probado.
 */

/** Una fila que no es un grupo del catálogo: «Solo algunos alumnos». */
export interface FilaExtra {
  id: string;
  titulo: string;
  detalle: string;
  puesta: boolean;
  onElegir: () => void;
}

const FILA = 'flex cursor-pointer items-center gap-3 px-3 py-3';
const RADIO = 'h-4 w-4 shrink-0 accent-zero-600';
const PASTILLA = 'rounded-lg border px-3 py-2 text-sm transition-colors sm:py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500';
const PASTILLA_PUESTA = 'border-zero-600 bg-zero-600 font-medium text-white';
const PASTILLA_LIBRE = 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50';

/** El fondo de la fila: la elegida se queda en azul claro, las demás lo insinúan al pasar. */
const fondo = (puesta: boolean) => (puesta ? 'bg-zero-50' : 'hover:bg-gray-50');

/** «5 alumnos», «1 alumno» o «Nadie matriculado». Sin número si no se pudo contar. */
function cuantos(n: number): string {
  if (n === 0) return 'Nadie matriculado';
  return n === 1 ? '1 alumno' : `${n} alumnos`;
}

export function FiltroCurso({
  cursos, periodoId, valor, onChange, elegido, conteo, nombre, etiquetadoPor, filasExtra = [],
}: {
  /** Ya filtrados por activo; aquí solo se recortan por año escolar. */
  cursos: CursoFiltrable[];
  /** Año escolar elegido. Sin él solo queda «Todo el colegio». */
  periodoId: number | null;
  /** Ya pasado por `normalizarFiltro`: sus ids tienen que existir este año. */
  valor: FiltroGrupo;
  onChange: (filtro: FiltroGrupo) => void;
  /** ¿La persona ya eligió un grupo? En false no se marca ninguna fila. */
  elegido: boolean;
  /** Alumnos por grupo. `null` mientras llega o si falló: las filas salen sin número. */
  conteo: ConteoAlumnos | null;
  /** El `name` de los radios: con él, las flechas del teclado recorren la lista. */
  nombre: string;
  /** Id del título que nombra la lista para el lector de pantalla. */
  etiquetadoPor: string;
  filasExtra?: FilaExtra[];
}) {
  const { grupos, colegio, afinar } = useMemo(
    () => preguntasDelFiltro(cursos, periodoId, valor, conteo, elegido),
    [cursos, periodoId, valor, conteo, elegido],
  );

  const numero = (opcion: OpcionGrupo) => (opcion.alumnos == null ? null : (
    <span className="shrink-0 text-sm tabular-nums text-gray-500">{cuantos(opcion.alumnos)}</span>
  ));

  return (
    <div role="radiogroup" aria-labelledby={etiquetadoPor}
      className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
      {grupos.map((grupo) => (
        <div key={grupo.id}>
          <label className={`${FILA} ${fondo(grupo.puesta)}`}>
            <input type="radio" name={nombre} className={RADIO}
              checked={grupo.puesta} onChange={() => onChange(grupo.filtro)} />
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">{grupo.etiqueta}</span>
            {numero(grupo)}
          </label>

          {/* Acotar va DENTRO de la fila elegida: es una pregunta sobre ese
              grupo, no otro campo del formulario. */}
          {grupo.puesta && afinar.length > 0 && (
            <div className="space-y-3 border-t border-zero-100 bg-zero-50/40 px-3 py-3 sm:pl-10">
              {afinar.map((pregunta) => (
                <div key={pregunta.id} role="group" aria-labelledby={`${nombre}-${pregunta.id}`}>
                  <p id={`${nombre}-${pregunta.id}`} className="text-xs font-medium text-gray-700">
                    {pregunta.pregunta}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {pregunta.opciones.map((opcion) => (
                      <button key={opcion.id} type="button" aria-pressed={opcion.puesta}
                        className={`${PASTILLA} ${opcion.puesta ? PASTILLA_PUESTA : PASTILLA_LIBRE}`}
                        // Tocar la que ya está puesta no cambia nada, y avisar
                        // de un cambio tiraría la lista ya revisada.
                        onClick={() => { if (!opcion.puesta) onChange(opcion.filtro); }}>
                        {opcion.etiqueta}
                        {opcion.alumnos != null && (
                          <>
                            <span aria-hidden className="ml-1.5 tabular-nums opacity-70">· {opcion.alumnos}</span>
                            <span className="sr-only">, {cuantos(opcion.alumnos)}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <label className={`${FILA} ${fondo(colegio.puesta)}`}>
        <input type="radio" name={nombre} className={RADIO}
          checked={colegio.puesta} onChange={() => onChange(colegio.filtro)} />
        <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
          {colegio.etiqueta}
          <span className="block text-xs font-normal text-gray-500">
            Todos los alumnos matriculados este año escolar.
          </span>
        </span>
        {numero(colegio)}
      </label>

      {filasExtra.map((fila) => (
        <label key={fila.id} className={`${FILA} ${fondo(fila.puesta)}`}>
          <input type="radio" name={nombre} className={RADIO}
            checked={fila.puesta} onChange={fila.onElegir} />
          <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
            {fila.titulo}
            <span className="block text-xs font-normal text-gray-500">{fila.detalle}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
