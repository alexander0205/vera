'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import { METODOS_PAGO } from '@/lib/pagos/metodos';

interface Props {
  pagoRecibido: boolean;
  setPagoRecibido: (v: boolean) => void;
  pagoFecha: string;
  setPagoFecha: (v: string) => void;
  pagoCuenta: string;
  setPagoCuenta: (v: string) => void;
  pagoMetodo: string;
  setPagoMetodo: (v: string) => void;
  pagoValor: string;
  setPagoValor: (v: string) => void;
}

/**
 * Detalle de pago recibido — rendered inside the accordion section #8.
 * A toggle controls whether the document records a payment. When enabled,
 * the parent's right sidebar shows the live "saldo pendiente" summary.
 */
export function PagoRecibido({
  pagoRecibido, setPagoRecibido,
  pagoFecha, setPagoFecha,
  pagoCuenta, setPagoCuenta,
  pagoMetodo, setPagoMetodo,
  pagoValor, setPagoValor,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={pagoRecibido}
          onChange={(e) => setPagoRecibido(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm text-gray-700">Registrar un pago recibido en esta factura</span>
      </label>

      {pagoRecibido && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Numeración</Label>
            <Select defaultValue="recibo">
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recibo">Recibo de caja</SelectItem>
                <SelectItem value="orden">Orden de pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Fecha</Label>
            <Input
              type="date"
              className="mt-1 h-9 text-sm"
              value={pagoFecha}
              onChange={(e) => setPagoFecha(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Cuenta bancaria</Label>
            <Input
              className="mt-1 h-9 text-sm"
              placeholder="Seleccionar"
              value={pagoCuenta}
              onChange={(e) => setPagoCuenta(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Método de pago</Label>
            <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODOS_PAGO.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Valor</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 font-medium">RD$</span>
              <Input
                type="number" inputMode="decimal" min={0} step={0.01}
                className="h-9 text-sm pl-10"
                placeholder="0.00"
                value={pagoValor}
                onChange={(e) => setPagoValor(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
      {pagoRecibido && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => openProximamente('Pagos múltiples (tarjeta + efectivo)')}
            className="text-teal-600 hover:text-teal-800 text-xs font-medium flex items-center gap-1"
          >
            + Agregar otro método de pago (split payment)
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
