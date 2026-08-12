'use client';

/**
 * Comprobantes de una factura — tarjeta del detalle.
 *
 * Se monta debajo de la tarjeta de Pago. Si la factura no tiene comprobantes y
 * el usuario no puede subir, no se dibuja nada: una tarjeta vacía en el detalle
 * solo ocupa espacio.
 */

import { useState, useEffect, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import ComprobantesUploader, { type AdjuntoSubido } from '@/components/pagos/ComprobantesUploader';
import { usePermissions } from '@/lib/hooks/usePermissions';

export function ComprobantesCard({ docId }: { docId: number }) {
  const { can } = usePermissions();
  const puedeSubir = can('facturas:crear');

  const [adjuntos, setAdjuntos] = useState<AdjuntoSubido[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    fetch(`/api/pagos/adjuntos?docId=${docId}`)
      .then(r => (r.ok ? r.json() : { adjuntos: [] }))
      .then(j => setAdjuntos(Array.isArray(j.adjuntos) ? j.adjuntos : []))
      .catch(() => setAdjuntos([]))
      .finally(() => setCargando(false));
  }, [docId]);

  useEffect(cargar, [cargar]);

  if (cargando) return null;
  if (adjuntos.length === 0 && !puedeSubir) return null;

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-semibold text-gray-900">
          Comprobantes {adjuntos.length > 0 && `(${adjuntos.length})`}
        </span>
      </div>
      <div className="p-4">
        <ComprobantesUploader
          docId={docId}
          adjuntos={adjuntos}
          onChange={setAdjuntos}
          disabled={!puedeSubir}
          compacto
        />
      </div>
    </div>
  );
}
