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
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Pago recibido</h3>
          <p className="text-xs text-gray-500 mt-0.5">Si te hicieron un pago asociado a esta venta puedes hacer aquí su registro.</p>
        </div>
        {!pagoRecibido ? (
          <button
            type="button"
            onClick={() => setPagoRecibido(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors">
            <DollarSign className="h-4 w-4" />
            Agregar pago
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPagoRecibido(false)}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            Quitar pago
          </button>
        )}
      </div>

      {pagoRecibido && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="grid grid-cols-5 gap-3 mb-2 mt-4">
            {['Numeración', 'Fecha', 'Cuenta bancaria', 'Método de pago', 'Valor'].map(h => (
              <p key={h} className="text-xs font-medium text-gray-500">{h}</p>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-3 items-center">
            <Select defaultValue="recibo">
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recibo">Recibo de caja</SelectItem>
                <SelectItem value="orden">Orden de pago</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="h-9 text-sm"
              value={pagoFecha}
              onChange={(e) => setPagoFecha(e.target.value)}
            />
            <Input
              className="h-9 text-sm"
              placeholder="Seleccionar"
              value={pagoCuenta}
              onChange={(e) => setPagoCuenta(e.target.value)}
            />
            <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
              <SelectTrigger className="h-9 text-sm">
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
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">RD$</span>
              <Input
                type="number" min={0} step={0.01}
                className="h-9 text-sm pl-10"
                placeholder="0.00"
                value={pagoValor}
                onChange={(e) => setPagoValor(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
