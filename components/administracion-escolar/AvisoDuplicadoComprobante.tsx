'use client';

/**
 * «Posible duplicado»: este comprobante se parece a otro de la misma familia.
 *
 * No bloquea nada —dos hermanos pagan la misma mensualidad el mismo día— pero
 * tiene que verse: aprobar dos veces la misma transferencia registra el cobro
 * doble. Va en rojo cuando la señal es firme (el mismo archivo o la misma
 * referencia del banco) y en ámbar cuando es solo el mismo monto y fecha.
 */

import { Copy } from 'lucide-react';
import { fmtFechaRD } from '@/lib/utils/format';
import { textoMotivoDuplicado, type Duplicado } from '@/lib/administracion-escolar/comprobante-lectura';

const ESTADO_TEXTO: Record<string, string> = {
  aprobado: 'aprobado',
  pendiente: 'pendiente',
};

export function AvisoDuplicadoComprobante({ duplicado, onVer }: {
  duplicado: Duplicado;
  /** Lleva a ese comprobante en la lista. Sin él no se pinta el botón. */
  onVer?: (id: number) => void;
}) {
  const firme = duplicado.motivo !== 'monto_fecha';
  const estado = ESTADO_TEXTO[duplicado.estado] ?? duplicado.estado;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        firme ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <Copy className={`mt-0.5 h-4 w-4 shrink-0 ${firme ? 'text-red-600' : 'text-amber-600'}`} />
      <div className={`min-w-0 flex-1 text-sm ${firme ? 'text-red-900' : 'text-amber-900'}`}>
        <p className="font-semibold">
          Posible duplicado del comprobante #{duplicado.id}
          {' '}({estado}, subido el {fmtFechaRD(duplicado.creadoEn)})
        </p>
        <p className="text-xs">
          Es de la misma familia y {textoMotivoDuplicado(duplicado.motivo)}.
          {duplicado.estado === 'aprobado'
            ? ' Ese ya se cobró: si es el mismo pago, no lo apruebes otra vez.'
            : ' Si es el mismo pago, apruébalo una sola vez y rechaza el otro.'}
        </p>
      </div>
      {onVer && (
        <button
          type="button"
          onClick={() => onVer(duplicado.id)}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:underline ${
            firme ? 'text-red-800' : 'text-amber-800'
          }`}
        >
          Ver #{duplicado.id}
        </button>
      )}
    </div>
  );
}
