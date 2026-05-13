'use client';

import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DollarSign } from 'lucide-react';

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

export function PagoRecibido({
  pagoRecibido, setPagoRecibido,
  pagoFecha, setPagoFecha,
  pagoCuenta, setPagoCuenta,
  pagoMetodo, setPagoMetodo,
  pagoValor, setPagoValor,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Pago recibido</h3>
          <p className="text-xs text-gray-500 mt-0.5">Si te hicieron un pago asociado a esta venta puedes hacer aquí su registro.</p>
        </div>
        {!pagoRecibido ? (
          <button
            type="button"
            onClick={() => setPagoRecibido(true)}
            className="self-start sm:self-auto flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-3 py-2 hover:bg-teal-50 transition-colors shrink-0">
            <DollarSign className="h-4 w-4" />
            Agregar pago
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPagoRecibido(false)}
            className="self-start sm:self-auto text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors shrink-0">
            Quitar pago
          </button>
        )}
      </div>

      {pagoRecibido && (
        <div className="px-4 pb-5 md:px-6 md:pb-6 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Numeración</p>
              <Select defaultValue="recibo">
                <SelectTrigger className="h-10 md:h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recibo">Recibo de caja</SelectItem>
                  <SelectItem value="orden">Orden de pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Fecha</p>
              <Input
                type="date"
                className="h-10 md:h-9 text-sm"
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Cuenta bancaria</p>
              <Input
                className="h-10 md:h-9 text-sm"
                placeholder="Seleccionar"
                value={pagoCuenta}
                onChange={(e) => setPagoCuenta(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Método de pago</p>
              <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
                <SelectTrigger className="h-10 md:h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                  <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                  <SelectItem value="tarjeta_debito">Tarjeta de débito</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Valor</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 font-medium">RD$</span>
                <Input
                  type="number" inputMode="decimal" min={0} step={0.01}
                  className="h-10 md:h-9 text-sm pl-10"
                  placeholder="0.00"
                  value={pagoValor}
                  onChange={(e) => setPagoValor(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
