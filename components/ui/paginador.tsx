'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Paginador de listados.
 *
 * Enseña siempre el total y el tramo que se está viendo. Eso importa más que
 * los botones: sin el total, una lista cortada en la fila cincuenta parece la
 * lista completa, y quien la mira no tiene forma de saber que falta algo.
 */
export function Paginador({
  pagina,
  paginas,
  total,
  porPagina,
  onCambiar,
  cargando = false,
}: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
  cargando?: boolean;
}) {
  if (total === 0) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
      <p className="text-sm text-gray-500">
        {total === 1
          ? '1 registro'
          : <>Mostrando <span className="font-medium text-gray-700">{desde}–{hasta}</span> de{' '}
             <span className="font-medium text-gray-700">{total.toLocaleString('es-DO')}</span></>}
      </p>

      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCambiar(pagina - 1)}
            disabled={pagina <= 1 || cargando}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="px-2 text-sm text-gray-500">{pagina} de {paginas}</span>
          <button
            onClick={() => onCambiar(pagina + 1)}
            disabled={pagina >= paginas || cargando}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-40"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
