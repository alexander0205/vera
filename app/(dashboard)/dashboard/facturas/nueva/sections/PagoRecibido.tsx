'use client';

import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DollarSign, Plus, X } from 'lucide-react';

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
  // Compact mode: no card at all, just a small "+ Registrar pago recibido" button
  if (!pagoRecibido) {
    return (
      <div className="mt-3 px-1">
        <button
          type="button"
          onClick={() => setPagoRecibido(true)}
          className="text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar pago recibido
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
        <div className="min-w-0 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-teal-600 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-800">Pago recibido</h3>
        </div>
        <button
          type="button"
          onClick={() => setPagoRecibido(false)}
          aria-label="Quitar pago"
          className="self-start sm:self-auto text-sm font-medium text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" /> Quitar
        </button>
      </div>

      <div className="px-4 pb-4 md:px-6 md:pb-5 border-t border-gray-100">
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
    </div>
  );
}
