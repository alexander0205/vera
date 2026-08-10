'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Layers, Loader2, AlertTriangle } from 'lucide-react';
import type { VariantePick } from '../utils/types';

/**
 * Selector de variante para una línea de factura. Cuando el producto elegido
 * tiene variantes (talla/color…), el usuario debe escoger cuál vende — de esa
 * elección depende a qué stock pega el descuento. Muestra stock y precio de cada
 * una; las agotadas se marcan pero no se bloquean (el backend valida stock).
 */
export function ModalSeleccionarVariante({ productoId, productoNombre, open, onClose, onPick }: {
  productoId: number;
  productoNombre: string;
  open: boolean;
  onClose: () => void;
  onPick: (v: VariantePick) => void;
}) {
  const [variants, setVariants] = useState<VariantePick[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCargando(true); setError(null); setVariants([]);
    fetch(`/api/productos/${productoId}/variants`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('No se pudieron cargar las variantes')))
      .then((data) => setVariants(data.variants ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [open, productoId]);

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-teal-600" />Elegir variante
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600 mb-3">{productoNombre}</p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {cargando ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : variants.length === 0 && !error ? (
          <p className="text-sm text-gray-500 py-6 text-center">Este producto no tiene variantes activas.</p>
        ) : (
          <div className="space-y-2">
            {variants.map((v) => {
              const agotada = v.stockActual <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onPick(v)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{v.nombre}</p>
                    <p className={`text-xs mt-0.5 flex items-center gap-1 ${agotada ? 'text-red-600' : 'text-gray-500'}`}>
                      {agotada && <AlertTriangle className="h-3 w-3" />}
                      {agotada ? 'Agotada' : `Stock: ${v.stockActual}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                    RD$ {v.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
