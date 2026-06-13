'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, Download, Loader2, Printer } from 'lucide-react';
import { TIPOS_ECF } from '@/lib/ecf/types';

export function ModalPreviewPDF({
  open, onOpenChange, tipoEcf, previewUrl, loading, onEmitir,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipoEcf: string;
  /** Object URL (blob) del PDF de vista previa — NO crea factura en DB. */
  previewUrl: string | null;
  loading: boolean;
  onEmitir: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100%-1rem)] sm:w-full h-[95dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 md:px-6 border-b shrink-0">
          <DialogTitle className="text-sm md:text-base font-semibold flex flex-wrap items-center gap-2">
            <span className="truncate">Vista previa — {TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? 'Comprobante'}</span>
            <span className="text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              BORRADOR
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-gray-100">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Vista previa del comprobante"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando PDF…
            </div>
          )}
        </div>

        <div className="px-4 py-3 md:px-6 md:py-4 border-t shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 bg-white">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-gray-500 w-full sm:w-auto">
            ← Volver a editar
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {previewUrl && (
              <>
                <Button
                  variant="outline" size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => window.open(previewUrl, '_blank')}
                >
                  <Printer className="h-3.5 w-3.5" />Imprimir
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = previewUrl;
                    a.download = 'vista-previa.pdf';
                    a.click();
                  }}
                >
                  <Download className="h-3.5 w-3.5" />Descargar
                </Button>
              </>
            )}
            <Button
              size="sm"
              disabled={loading}
              className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5"
              onClick={onEmitir}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Emitir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
