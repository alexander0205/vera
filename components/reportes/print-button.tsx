'use client';

/**
 * Botón de impresión para reportes. Dispara el diálogo nativo del navegador
 * sobre el `.print-area` del ReportShell. El PDF descargable usa su propio botón.
 */
import { Printer } from 'lucide-react';

export function PrintButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 border border-zero-600 text-zero-700 hover:bg-zero-50 rounded-lg text-sm font-medium transition-colors shrink-0 disabled:opacity-50 disabled:cursor-default"
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
