'use client';

import { useState } from 'react';
import { FileText, CreditCard, Info, ChevronDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EmpresaPerfil, Retencion, ItemLinea } from '../utils/types';
import { calcularMontoItem } from '../utils/calculos';

interface Props {
  empresa: EmpresaPerfil | null;
  totales: { bruto: number; subtotal: number; descuento: number; itbis: number; total: number };
  retenciones: Retencion[];
  totalNeto: number;
  items: ItemLinea[];
  /** Si false, oculta el card "Pago" entero. Útil para facturas recurrentes
   *  (plantillas que no registran pago directo). Default true. */
  showPago?: boolean;
  /** Optional pago recibido block — rendered inline when enabled. */
  pagoRecibido?: boolean;
  setPagoRecibido?: (v: boolean) => void;
  pagoMetodo?: string;
  setPagoMetodo?: (v: string) => void;
  pagoCuenta?: string;
  setPagoCuenta?: (v: string) => void;
  pagoValor?: string;
  setPagoValor?: (v: string) => void;
  pagoFecha?: string;
  setPagoFecha?: (v: string) => void;
}

const fmt = (n: number) =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Sticky right-side sidebar con Resumen + Pago como dos cards independientes.
 * Resumen muestra items, totales y saldo pendiente.
 * Pago tiene su propio toggle + método/fecha/cuenta/valor.
 */
export function ResumenSidebar({
  empresa, totales, retenciones, totalNeto, items,
  showPago = true,
  pagoRecibido = false, setPagoRecibido,
  pagoMetodo = '', setPagoMetodo,
  pagoCuenta = '', setPagoCuenta,
  pagoValor = '', setPagoValor,
  pagoFecha = '', setPagoFecha,
}: Props) {
  const [resumenOpen, setResumenOpen] = useState(true);
  const [pagoOpen, setPagoOpen]       = useState(true);

  const pagoNum = parseFloat(pagoValor) || 0;
  const saldoPendiente = Math.max(0, totalNeto - pagoNum);

  // Items con nombre (filtra líneas vacías)
  const itemsConNombre = items.filter(i => i.nombreItem.trim());

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* ─── Resumen card ─── */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setResumenOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 pt-4 pb-3 md:px-5 hover:bg-gray-50 transition-colors"
          aria-expanded={resumenOpen}
        >
          <FileText className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900 flex-1 text-left">Resumen</h2>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${resumenOpen ? '' : '-rotate-90'}`} />
        </button>

        {resumenOpen && (
          <div className="px-4 pb-4 md:px-5">
            {/* Tabla items */}
            {itemsConNombre.length > 0 && (
              <>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-[11px] text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-100">
                  <span>Descripción</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {itemsConNombre.map(item => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-sm">
                      <span className="text-gray-700 truncate" title={item.nombreItem}>{item.nombreItem}</span>
                      <span className="text-gray-600 text-right tabular-nums">{item.cantidadItem}</span>
                      <span className="text-gray-900 font-medium text-right tabular-nums whitespace-nowrap">{fmt(calcularMontoItem(item))}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Totales */}
            <div className="pt-3 mt-1 space-y-1.5 border-t border-gray-100">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium text-gray-800 tabular-nums">{fmt(totales.bruto - totales.descuento)}</span>
              </div>
              {totales.descuento > 0 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Descuento</span>
                  <span className="tabular-nums">-{fmt(totales.descuento)}</span>
                </div>
              )}
              {totales.itbis > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>ITBIS (18%)</span>
                  <span className="font-medium text-gray-800 tabular-nums">{fmt(totales.itbis)}</span>
                </div>
              )}
              {retenciones.map((ret, idx) => (
                <div key={idx} className="flex justify-between text-sm text-red-500">
                  <span className="truncate pr-2">{ret.nombre} ({ret.porcentaje}%)</span>
                  <span className="tabular-nums">-{fmt(ret.monto)}</span>
                </div>
              ))}
            </div>

            {/* Total bold */}
            <div className="flex justify-between text-base font-bold text-gray-900 border-t-2 border-gray-200 pt-3 mt-3">
              <span>Total</span>
              <span className="tabular-nums">{fmt(totalNeto)}</span>
            </div>

            {/* Pagado + saldo */}
            {pagoRecibido && (
              <>
                <div className="flex justify-between text-sm text-gray-600 mt-3">
                  <span>Pagado</span>
                  <span className="font-medium text-gray-800 tabular-nums">{fmt(pagoNum)}</span>
                </div>
                <div className="flex justify-between text-sm bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 mt-2">
                  <span className="text-teal-700 font-semibold">Saldo pendiente</span>
                  <span className="text-teal-800 font-bold tabular-nums">{fmt(saldoPendiente)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Firma — discreto */}
        {resumenOpen && empresa?.firma && (
          <div className="px-4 pb-4 md:px-5 border-t border-gray-100 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Firma autorizada</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={empresa.firma}
              alt="Firma autorizada"
              className="h-10 object-contain"
            />
          </div>
        )}
      </section>

      {/* ─── Pago card (sticky aparte) ─── */}
      {showPago && (
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setPagoOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 pt-4 pb-3 md:px-5 hover:bg-gray-50 transition-colors"
          aria-expanded={pagoOpen}
        >
          <CreditCard className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900 flex-1 text-left">Pago</h2>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${pagoOpen ? '' : '-rotate-90'}`} />
        </button>

        {pagoOpen && (
          <div className="px-4 pb-4 md:px-5 space-y-3">
            {/* Toggle registrar pago */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pagoRecibido}
                onChange={e => setPagoRecibido?.(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Registrar pago recibido</span>
            </label>

            {pagoRecibido && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Método de pago</Label>
                    <Select value={pagoMetodo || 'efectivo'} onValueChange={(v) => setPagoMetodo?.(v)}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                        <SelectItem value="tarjeta_debito">Tarjeta de débito</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Fecha</Label>
                    <Input
                      type="date"
                      className="mt-1 h-9 text-sm"
                      value={pagoFecha}
                      onChange={(e) => setPagoFecha?.(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Cuenta bancaria</Label>
                    <Select value={pagoCuenta || ''} onValueChange={(v) => setPagoCuenta?.(v)}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caja">Caja general</SelectItem>
                        <SelectItem value="banreservas">Banreservas</SelectItem>
                        <SelectItem value="popular">Banco Popular</SelectItem>
                        <SelectItem value="bhd">BHD</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Valor</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 font-medium">RD$</span>
                      <Input
                        type="number" inputMode="decimal" min={0} step={0.01}
                        className="h-9 text-sm pl-10"
                        placeholder="0.00"
                        value={pagoValor}
                        onChange={(e) => setPagoValor?.(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-600">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400" />
                  <span>Registra el pago recibido en esta sección. El resumen se actualiza automáticamente.</span>
                </div>
              </>
            )}
          </div>
        )}
      </section>
      )}
    </aside>
  );
}
