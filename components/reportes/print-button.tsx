'use client';

/**
 * Botón de impresión para reportes. Dispara el diálogo nativo del navegador
 * (imprimir o guardar como PDF) sobre el `.print-area` del ReportShell, de modo
 * que el PDF salga tal cual se ve la pantalla. Complementa —no reemplaza— el
 * export a Excel.
 */
import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 border border-zero-600 text-zero-700 hover:bg-zero-50 rounded-lg text-sm font-medium transition-colors shrink-0"
    >
      <Printer className="h-4 w-4" />
      Imprimir / PDF
    </button>
  );
}
