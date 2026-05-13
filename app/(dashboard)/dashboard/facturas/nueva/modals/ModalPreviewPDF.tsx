'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, Download, Loader2, Printer } from 'lucide-react';
import { TIPOS_ECF } from '@/lib/ecf/types';

export function ModalPreviewPDF({
  open, onOpenChange, tipoEcf, previewDocId, loading, onEmitir,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipoEcf: string;
  previewDocId: number | null;
  loading: boolean;
  onEmitir: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">
            Vista previa — {TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? 'Comprobante'}
            <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              BORRADOR
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-gray-100">
          {previewDocId ? (
            <iframe
              src={`/api/pdf/factura/${previewDocId}`}
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

        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between bg-white">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-gray-500">
            ← Volver a editar
          </Button>
          <div className="flex gap-2">
            {previewDocId && (
              <>
                <Button
                  variant="outline" size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => window.open(`/api/pdf/factura/${previewDocId}`, '_blank')}
                >
                  <Printer className="h-3.5 w-3.5" />Imprimir
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `/api/pdf/factura/${previewDocId}`;
                    a.download = `borrador-${previewDocId}.pdf`;
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
