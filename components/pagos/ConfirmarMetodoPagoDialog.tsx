'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Una línea del resumen a reconfirmar: método legible + monto ya formateado. */
export interface ResumenMetodo {
  /** Etiqueta legible del método (p. ej. "Efectivo", "Tarjeta"). */
  label: string;
  /** Monto ya formateado para mostrar (p. ej. "RD$ 1,200.00"). */
  montoFmt: string;
}

interface Props {
  /** Métodos/montos a reconfirmar. Si hay >1, es un pago dividido. */
  lineas: ResumenMetodo[];
  /** Vuelve al formulario sin cobrar. */
  onCancel: () => void;
  /** El usuario confirma que el método es correcto → finalizar. */
  onConfirm: () => void;
  /** Deshabilita el botón confirmar mientras procesa. */
  procesando?: boolean;
}

/**
 * Alerta de "double-check" del método de pago.
 *
 * Presentacional: no conoce POS ni facturas; cada pantalla arma `lineas` con su
 * propio formateo (ver labelMetodo en lib/pagos/metodos). Su único trabajo es
 * poner el MÉTODO al frente, grande, para que el cajero no cobre efectivo por
 * tarjeta (o viceversa) por inercia. Fuente de métodos: lib/pagos/metodos.
 */
export function ConfirmarMetodoPagoDialog({ lineas, onCancel, onConfirm, procesando = false }: Props) {
  const dividido = lineas.length > 1;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar método de pago"
    >
      <div
        className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Confirma el método de pago</p>
            <p className="text-[11px] text-gray-500">Revisa que sea el correcto antes de cobrar.</p>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          {lineas.map((l, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2"
            >
              <span className="text-base font-bold uppercase tracking-wide text-amber-800">{l.label}</span>
              <span className="text-sm font-medium text-gray-700">{l.montoFmt}</span>
            </div>
          ))}
          {dividido && (
            <p className="text-[11px] text-gray-400">Pago dividido en {lineas.length} métodos.</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={procesando}
          >
            Volver
          </Button>
          <Button
            type="button"
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={onConfirm}
            disabled={procesando}
          >
            {procesando ? 'Procesando…' : 'Sí, cobrar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
