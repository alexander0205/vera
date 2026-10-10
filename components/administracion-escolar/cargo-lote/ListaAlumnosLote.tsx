'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  filtrarAlumnos, ordenarParaRevisar, type DetalleRevisado,
} from '@/lib/administracion-escolar/cargo-lote';

/**
 * Paso 3 de «Cargo a varios alumnos»: la lista de a quién se le va a cobrar,
 * con una casilla por alumno.
 *
 * Es lo último que se mira antes de crear la deuda, así que está hecha para
 * repasarla de arriba abajo sin tropezar:
 *
 *  - no tiene alto fijo ni scroll propio: baja con la página. Dentro de un
 *    recuadro con su barrita, en el teléfono había que acertar con el dedo en
 *    cuál de los dos scrolls se estaba;
 *  - los que ya tienen el cargo van al FINAL, juntos y bajo un rótulo que dice
 *    por qué no se pueden marcar. Mezclados por orden alfabético, cada casilla
 *    bloqueada era una pregunta («¿y a este por qué no?»);
 *  - debajo de cada nombre va su curso: con el colegio entero delante, dos
 *    «José Pérez» solo se distinguen por ahí;
 *  - los botones de marcar actúan SOLO sobre lo que se ve y lo dicen («Marcar
 *    estos 3»). El «Marcar todos» de antes marcaba al colegio entero aunque se
 *    hubiera buscado «primero a», y nada en la pantalla lo avisaba;
 *  - marcando uno por uno se puede pedir «Ver solo los marcados»: ocho casillas
 *    repartidas entre ciento cincuenta nombres no se repasan, y el «José Pérez»
 *    de la fila de al lado solo se descubre viéndolos juntos.
 *
 * No decide a quién se le cobra: pinta las marcas que le pasan y avisa de cada
 * cambio. Lo único suyo es lo que se está buscando.
 */

/** Con ocho nombres o menos se ven todos de un vistazo: no hace falta buscar. */
const HERRAMIENTAS_DESDE = 8;

/*
 * Los márgenes de scroll son para quien baja con el tabulador: la barra de
 * cobrar va pegada abajo y las herramientas arriba, y sin ellos la casilla con
 * el foco podía quedar DEBAJO de una de las dos —dentro de la pantalla para el
 * navegador, tapada para la persona— y Espacio cambiaba una marca sin verla.
 */
const CASILLA = 'h-4 w-4 shrink-0 accent-zero-600 scroll-mb-48 sm:scroll-mb-36 sm:scroll-mt-16';
const ENLACE = 'rounded text-sm font-medium text-zero-600 hover:text-zero-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500';

export function ListaAlumnosLote({ detalles, seleccion, cursoPorAlumno, aMano, onAlternar, onMarcarVarios }: {
  /** La lista que devolvió la revisión, tal cual. */
  detalles: DetalleRevisado[];
  /** Los alumnos marcados: a esos se les crea el cargo. */
  seleccion: Set<number>;
  /** De qué curso es cada alumno. Vacío si no se pudo saber: la fila sale sin curso. */
  cursoPorAlumno: Map<number, string>;
  /** «Solo algunos alumnos»: se llega sin nadie marcado y se va añadiendo. */
  aMano: boolean;
  onAlternar: (estudianteId: number) => void;
  onMarcarVarios: (estudianteIds: number[], marcar: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  /**
   * «Ver solo los marcados»: los que estaban marcados AL PEDIRLO. `null` = se
   * ven todos.
   *
   * Es una foto y no un cálculo en vivo a propósito: si al repasar se le quita
   * la marca a uno, su fila se queda ahí, sin marca, y se le puede volver a
   * poner. Calculado en vivo, la fila desaparecería bajo el dedo.
   */
  const [soloEstos, setSoloEstos] = useState<Set<number> | null>(null);

  const ordenados = useMemo(() => ordenarParaRevisar(detalles), [detalles]);
  const visibles = useMemo(
    () => filtrarAlumnos(
      soloEstos ? ordenados.filter((d) => soloEstos.has(d.estudianteId)) : ordenados,
      cursoPorAlumno, query,
    ),
    [ordenados, soloEstos, cursoPorAlumno, query],
  );

  const hayBusqueda = query.trim() !== '';
  // Lo que se ve no es la lista entera: se buscó algo o se pidieron solo los marcados.
  const acotado = hayBusqueda || soloEstos !== null;
  const marcables = visibles.filter((d) => d.resultado !== 'duplicado');
  const yaLoTienen = visibles.filter((d) => d.resultado === 'duplicado');
  const marcadosALaVista = marcables.filter((d) => seleccion.has(d.estudianteId)).length;
  const idsALaVista = marcables.map((d) => d.estudianteId);
  const marcadosEnTotal = ordenados.filter(
    (d) => d.resultado !== 'duplicado' && seleccion.has(d.estudianteId),
  ).length;

  // Cada botón existe solo si haría algo. Y marcando a mano, «Marcar a todos»
  // sin haber buscado nada no existe: sería volver a cobrarle al colegio
  // entero, que es justo lo que se dijo que no.
  const puedeMarcar = marcadosALaVista < marcables.length && (hayBusqueda || !aMano);
  const puedeQuitar = marcadosALaVista > 0;
  const estos = marcables.length === 1 ? 'este' : `estos ${marcables.length}`;
  // Solo marcando uno por uno: en un grupo lo normal es que estén casi todos
  // marcados, y a quién se le quitó la marca ya lo dice la barra de cobrar.
  const puedeVerMarcados = aMano && (soloEstos !== null || marcadosEnTotal > 0);

  const conHerramientas = aMano || detalles.length > HERRAMIENTAS_DESDE;

  const fila = (d: DetalleRevisado) => {
    const yaLoTiene = d.resultado === 'duplicado';
    const marcado = !yaLoTiene && seleccion.has(d.estudianteId);
    const segundaLinea = [cursoPorAlumno.get(d.estudianteId), d.codigo].filter(Boolean).join(' · ');
    return (
      <li key={d.estudianteId}>
        <label className={`flex items-center gap-3 px-3 py-3 sm:py-2.5 ${
          yaLoTiene ? 'bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
          <input type="checkbox" className={CASILLA}
            disabled={yaLoTiene} checked={marcado}
            onChange={() => onAlternar(d.estudianteId)} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${marcado ? 'text-gray-900' : 'text-gray-500'}`}>
              {d.nombre}
            </span>
            {segundaLinea && <span className="block truncate text-xs text-gray-500">{segundaLinea}</span>}
          </span>
          {/* Una píldora de HTML y no la de la app: aquella es de MUI y no
              respeta el color que se le pone por clase. */}
          {yaLoTiene && (
            <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
              Ya lo tiene
            </span>
          )}
        </label>
      </li>
    );
  };

  return (
    <div>
      {conHerramientas && (
        // Pegadas arriba solo desde el portátil: en el teléfono se comían un
        // tercio de la pantalla junto con la barra de cobrar.
        <div className="flex flex-wrap items-center gap-2 bg-white py-2 sm:sticky sm:top-0 sm:z-10">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
            <Input className="pl-8" autoComplete="off"
              aria-label="Buscar alumno por nombre o curso" placeholder="Buscar por nombre o curso…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {puedeMarcar && (
            <Button type="button" variant="outline" size="sm" onClick={() => onMarcarVarios(idsALaVista, true)}>
              {hayBusqueda ? `Marcar ${marcables.length === 1 ? 'a este' : estos}` : 'Marcar a todos'}
            </Button>
          )}
          {puedeQuitar && (
            <Button type="button" variant="outline" size="sm" onClick={() => onMarcarVarios(idsALaVista, false)}>
              {acotado ? `Quitar la marca a ${estos}` : 'Quitar todas las marcas'}
            </Button>
          )}
          {puedeVerMarcados && (
            <button type="button" className={ENLACE} aria-pressed={soloEstos !== null}
              onClick={() => setSoloEstos((s) => (s ? null : new Set(
                ordenados.filter((d) => d.resultado !== 'duplicado' && seleccion.has(d.estudianteId))
                  .map((d) => d.estudianteId),
              )))}>
              {soloEstos ? 'Ver a todos los alumnos' : `Ver solo los marcados (${marcadosEnTotal})`}
            </button>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 px-3 py-4">
          <p className="text-sm text-gray-600">
            {soloEstos ? 'Ninguno de los que marcaste coincide con la búsqueda.' : 'Ningún alumno con ese nombre o curso.'}
          </p>
          <button type="button" className={`mt-1 ${ENLACE}`} onClick={() => setQuery('')}>
            Borrar la búsqueda
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          {marcables.map(fila)}
          {yaLoTienen.length > 0 && (
            <li className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              {yaLoTienen.length === 1
                ? 'Ya lo tiene y no se le cobra otra vez (1)'
                : `Ya lo tienen y no se les cobra otra vez (${yaLoTienen.length})`}
            </li>
          )}
          {yaLoTienen.map(fila)}
        </ul>
      )}
    </div>
  );
}
