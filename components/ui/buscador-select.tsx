'use client';

import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Un desplegable que se escribe para filtrar.
 *
 * Nace de listas que el `<select>` nativo no aguanta: un colegio con cientos de
 * alumnos, o las treinta y pico de secciones de todos los grados. Ahí elegir es
 * bajar rodando hasta encontrar, y con las secciones ni eso, porque se llaman
 * todas "A".
 *
 * Va con `<div>` y no con `<select>` a propósito, porque el nativo no deja
 * escribir dentro. Eso obliga a poner a mano lo que el sistema operativo daba
 * gratis: el teclado (flechas, Enter, Escape), el cierre al pinchar fuera y los
 * roles que lo hacen legible para un lector de pantalla.
 *
 * La lista se pinta pegada al campo y dentro del mismo contenedor, no en un
 * portal: estos controles viven dentro de diálogos, y un popover que se cuelga
 * del `body` deja de recibir clics cuando el modal apaga los eventos de la
 * página —el mismo problema que ya obligó a usar `NativeSelect` en vez del
 * Select de Radix.
 */

export interface OpcionBuscador {
  valor: string;
  etiqueta: string;
  /** Encabezado bajo el que se agrupa. Las de un mismo grupo van seguidas. */
  grupo?: string;
  /**
   * Cómo se lee dentro de la lista, si repetir la etiqueta entera sobra.
   *
   * Una sección se llama "Kinder — Inicial · Matutina — A": el campo necesita
   * ese nombre completo para decir qué hay elegido, pero dentro del grupo
   * "Kinder — Inicial · Matutina" lo único nuevo es la "A", y escribirlo todo
   * empujaba justo esa letra fuera del ancho visible.
   */
  etiquetaLista?: string;
  /** Segunda línea, para desempatar homónimos (código, cédula…). */
  detalle?: string;
}

/**
 * Deja un texto en minúsculas y sin tildes.
 *
 * Buscar "jose" tiene que encontrar a "José": quien escribe rápido no pone
 * tildes, y en un listado de nombres dominicanos eso es la mayoría de las
 * búsquedas.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function BuscadorSelect({
  value,
  onChange,
  opciones,
  placeholder = 'Buscar…',
  vacio = 'Sin resultados',
  disabled,
  id,
  className,
}: {
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionBuscador[];
  placeholder?: string;
  /** Qué decir cuando lo escrito no encuentra nada. */
  vacio?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [consulta, setConsulta] = React.useState('');
  const [resaltada, setResaltada] = React.useState(0);

  const contenedorRef = React.useRef<HTMLDivElement>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);
  const generado = React.useId();
  const idLista = `${id ?? generado}-lista`;

  const seleccionada = React.useMemo(
    () => opciones.find((o) => o.valor === value) ?? null,
    [opciones, value],
  );

  // Mientras está cerrado el campo muestra lo elegido; al abrirlo se vacía para
  // escribir sobre limpio, que es lo que se viene a hacer.
  const filtradas = React.useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return opciones;
    const palabras = q.split(/\s+/);
    return opciones.filter((o) => {
      const heno = normalizar(`${o.etiqueta} ${o.detalle ?? ''} ${o.grupo ?? ''}`);
      return palabras.every((p) => heno.includes(p));
    });
  }, [opciones, consulta]);

  // La opción resaltada se sale de sitio en cuanto el filtro cambia.
  React.useEffect(() => { setResaltada(0); }, [consulta]);

  // Al pinchar fuera se cierra sin elegir, como haría un desplegable de verdad.
  React.useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
        setConsulta('');
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // Mantiene a la vista la opción por la que va el teclado.
  React.useEffect(() => {
    if (!abierto) return;
    listaRef.current
      ?.querySelector<HTMLElement>('[data-resaltada="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [abierto, resaltada]);

  function elegir(opcion: OpcionBuscador) {
    onChange(opcion.valor);
    setAbierto(false);
    setConsulta('');
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) { setAbierto(true); return; }
      if (filtradas.length === 0) return;
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setResaltada((i) => (i + paso + filtradas.length) % filtradas.length);
      return;
    }
    if (e.key === 'Enter') {
      if (!abierto) return;
      // Solo traga el Enter si hay algo que elegir; si no, deja que el
      // formulario que envuelve al campo haga lo suyo.
      const opcion = filtradas[resaltada];
      if (!opcion) return;
      e.preventDefault();
      elegir(opcion);
      return;
    }
    if (e.key === 'Escape' && abierto) {
      e.preventDefault();
      e.stopPropagation();     // que no se lleve por delante el diálogo entero
      setAbierto(false);
      setConsulta('');
      return;
    }
    if (e.key === 'Tab' && abierto) {
      setAbierto(false);
      setConsulta('');
    }
  }

  // Los encabezados de grupo se cuelgan de la primera opción de cada tramo, así
  // la lista sigue siendo plana y el índice del teclado no se descuadra.
  let grupoAnterior: string | undefined;

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={seleccionada && !abierto ? seleccionada.etiqueta : placeholder}
          value={abierto ? consulta : (seleccionada?.etiqueta ?? '')}
          onChange={(e) => { setConsulta(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclado}
          className={cn(
            'h-10 w-full cursor-text rounded-lg border border-gray-300 bg-white pl-9 pr-16 text-sm text-gray-900',
            'outline-none transition-colors placeholder:text-gray-400',
            'hover:border-gray-400 focus:border-zero-500 focus:ring-1 focus:ring-zero-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />

        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
          {seleccionada && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Quitar selección"
              onClick={() => { onChange(''); setConsulta(''); setAbierto(false); }}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown aria-hidden className="mr-1.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {abierto && (
        <div
          ref={listaRef}
          id={idLista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtradas.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">{vacio}</p>
          ) : (
            filtradas.map((o, i) => {
              const abre = o.grupo && o.grupo !== grupoAnterior;
              grupoAnterior = o.grupo;
              const elegida = o.valor === value;
              return (
                <React.Fragment key={o.valor}>
                  {abre && (
                    <div className="sticky top-0 bg-white px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {o.grupo}
                    </div>
                  )}
                  <div
                    role="option"
                    aria-selected={elegida}
                    data-resaltada={i === resaltada}
                    // `mousedown` y no `click`: el clic llega después de que el
                    // input pierda el foco, y para entonces la lista ya cerró.
                    onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
                    onMouseEnter={() => setResaltada(i)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                      i === resaltada ? 'bg-zero-50 text-zero-900' : 'text-gray-700',
                    )}
                  >
                    <Check
                      aria-hidden
                      className={cn('h-4 w-4 shrink-0', elegida ? 'text-zero-600' : 'invisible')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.etiquetaLista ?? o.etiqueta}</span>
                      {o.detalle && (
                        <span className="block truncate text-xs text-gray-500">{o.detalle}</span>
                      )}
                    </span>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
