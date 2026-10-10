'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * Un paso de «Cargo a varios alumnos», en uno de sus tres estados.
 *
 * La pantalla hace tres preguntas —qué se cobra, a quién, y «¿es esto?»— y solo
 * una está abierta a la vez. Las otras dos no desaparecen:
 *
 *  - la ya CONTESTADA se queda en una línea con su respuesta, y la línea entera
 *    es el botón para volver a ella. Así lo decidido sigue a la vista mientras
 *    se repasa la lista, sin ocupar media pantalla;
 *  - la PENDIENTE es un rótulo gris que dice lo que viene. No es un botón ni
 *    parece uno: no hay nada que pulsar ahí hasta contestar lo de antes.
 *
 * El título del paso abierto recibe el foco al abrirse (lo pone la pantalla),
 * por eso lleva `tabIndex={-1}`, y delante un «Paso N de 3» que solo oye el
 * lector de pantalla: a la vista ya lo dice el número.
 */
export function PasoLote({ numero, titulo, estado, resumen, onCambiar, children }: {
  numero: 1 | 2 | 3;
  titulo: string;
  estado: 'abierto' | 'contestado' | 'pendiente';
  /** La respuesta, en una línea. Solo se enseña con el paso contestado. */
  resumen?: string;
  /** Volver a este paso. Solo se usa con el paso contestado. */
  onCambiar?: () => void;
  children?: ReactNode;
}) {
  const id = `lote-paso-${numero}`;

  if (estado === 'contestado') {
    return (
      <button type="button" onClick={onCambiar}
        className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500 sm:px-5">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zero-100 text-zero-700">
          <Check className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-gray-500">
            <span className="sr-only">Paso {numero} de 3, ya contestado: </span>{titulo}
          </span>
          {/* Sin recortar: en el teléfono parte en dos líneas, que es mejor que
              leer «RD$150.00 de «Día de ci…». */}
          <span className="block break-words text-sm font-semibold text-gray-900">{resumen}</span>
        </span>
        <span className="shrink-0 text-sm font-medium text-zero-600">Cambiar</span>
      </button>
    );
  }

  if (estado === 'pendiente') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 px-4 py-3 sm:px-5">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-500">
          {numero}
        </span>
        <p className="text-sm font-medium text-gray-500">
          <span className="sr-only">Paso {numero} de 3, todavía no: </span>{titulo}
        </p>
      </div>
    );
  }

  // Sin `overflow-hidden`: el paso 3 lleva dentro una barra pegada al borde de
  // abajo de la pantalla, y un contenedor que recorta la despega.
  return (
    <section aria-labelledby={id} className="rounded-xl border border-zero-200 bg-white">
      <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-5 sm:pt-5">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zero-600 text-xs font-semibold text-white">
          {numero}
        </span>
        <h2 id={id} tabIndex={-1} className="scroll-mt-4 text-base font-semibold text-gray-900 outline-none">
          <span className="sr-only">Paso {numero} de 3: </span>{titulo}
        </h2>
      </div>
      {children}
    </section>
  );
}
