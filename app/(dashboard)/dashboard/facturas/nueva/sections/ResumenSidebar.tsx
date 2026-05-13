'use client';

import { FileText, Wallet, Info } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EmpresaPerfil, Retencion } from '../utils/types';

interface Props {
  empresa: EmpresaPerfil | null;
  totales: { bruto: number; subtotal: number; descuento: number; itbis: number; total: number };
  retenciones: Retencion[];
  totalNeto: number;
  /** Optional pago recibido block — rendered inline when enabled. */
  pagoRecibido: boolean;
  pagoMetodo: string;
  setPagoMetodo: (v: string) => void;
  pagoValor: string;
  setPagoValor: (v: string) => void;
}

const fmt = (n: number) =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Sticky right-side sidebar with totales + (optional) pago recibido summary.
 * Renders on the right column on lg+; falls below the form on mobile.
 */
export function ResumenSidebar({
  empresa, totales, retenciones, totalNeto,
  pagoRecibido, pagoMetodo, setPagoMetodo, pagoValor, setPagoValor,
}: Props) {
  const pagoNum = parseFloat(pagoValor) || 0;
  const saldoPendiente = totalNeto - pagoNum;

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Resumen card */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <header className="flex items-center gap-2 px-4 pt-4 pb-2 md:px-5">
          <FileText className="h-4 w-4 text-teal-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Resumen</h2>
        </header>
        <div className="px-4 pb-4 md:px-5 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="font-medium text-gray-800">{fmt(totales.bruto)}</span>
          </div>
          {totales.descuento > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Descuento</span>
              <span>-{fmt(totales.descuento)}</span>
            </div>
          )}
          {totales.itbis > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>ITBIS (18%)</span>
              <span className="font-medium text-gray-800">{fmt(totales.itbis)}</span>
            </div>
          )}
          {retenciones.map((ret, idx) => (
            <div key={idx} className="flex justify-between text-sm text-red-500">
              <span className="truncate pr-2">{ret.nombre} ({ret.porcentaje}%)</span>
              <span>-{fmt(ret.monto)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
            <span>Total</span>
            <span>{fmt(totalNeto)}</span>
          </div>
        </div>

        {/* Firma — discreto */}
        {empresa?.firma ? (
          <div className="px-4 pb-4 md:px-5 border-t border-gray-100 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Firma autorizada</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={empresa.firma}
              alt="Firma autorizada"
              className="h-10 object-contain"
            />
          </div>
        ) : (
          <div className="px-4 pb-3 md:px-5">
            <a
              href="/dashboard/configuracion"
              className="text-xs text-gray-500 hover:text-teal-600 underline-offset-2 hover:underline transition-colors"
              title="Agregar firma en Configuración"
            >
              + Agregar firma
            </a>
          </div>
        )}
      </section>

      {/* Pago recibido summary */}
      {pagoRecibido && (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 px-4 pt-4 pb-2 md:px-5">
            <Wallet className="h-4 w-4 text-teal-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-900">Pago recibido</h2>
          </header>
          <div className="px-4 pb-4 md:px-5 space-y-3">
            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide">Método de pago</Label>
              <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
                <SelectTrigger className="mt-1 h-9 text-sm">
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
            <div className="flex justify-between text-sm bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
              <span className="text-teal-700 font-medium">Saldo pendiente</span>
              <span className="text-teal-800 font-bold">{fmt(Math.max(0, saldoPendiente))}</span>
            </div>
            {pagoNum > 0 && Math.abs(saldoPendiente) > 0.01 && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>La factura se guardará como borrador hasta cubrir el total.</span>
              </div>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
