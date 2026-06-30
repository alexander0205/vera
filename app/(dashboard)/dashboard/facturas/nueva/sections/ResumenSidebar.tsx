'use client';

import { useState } from 'react';
import { FileText, CreditCard, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PagoMetodos, sumaPagos, type PagoLinea } from '@/components/pagos/PagoMetodos';
import type { EmpresaPerfil, Retencion, ItemLinea } from '../utils/types';
import { calcularMontoItem } from '../utils/calculos';

interface Props {
  empresa: EmpresaPerfil | null;
  totales: { bruto: number; subtotal: number; descuento: number; itbis: number; total: number };
  retenciones: Retencion[];
  totalNeto: number;
  /** Etiqueta del total. Default "Total"; en NC/ND → "Total a acreditar/debitar". */
  totalLabel?: string;
  items: ItemLinea[];
  /** Si false, oculta el card "Pago" entero. Útil para facturas recurrentes
   *  (plantillas que no registran pago directo). Default true. */
  showPago?: boolean;
  /** Optional pago recibido block — rendered inline when enabled. */
  pagoRecibido?: boolean;
  setPagoRecibido?: (v: boolean) => void;
  pagoFecha?: string;
  setPagoFecha?: (v: string) => void;
  /** Líneas de pago (1 línea = pago normal). Controladas por el padre. */
  pagoLineas?: PagoLinea[];
  setPagoLineas?: (v: PagoLinea[]) => void;
}

const fmt = (n: number) =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Sticky right-side sidebar con Resumen + Pago como dos cards independientes.
 * Resumen muestra items, totales y saldo pendiente.
 * Pago tiene su propio toggle + método/fecha/cuenta/valor.
 */
export function ResumenSidebar({
  totales, retenciones, totalNeto, totalLabel = 'Total', items,
  showPago = true,
  pagoRecibido = false, setPagoRecibido,
  pagoFecha = '', setPagoFecha,
  pagoLineas = [{ metodo: 'efectivo', valor: '' }], setPagoLineas,
}: Props) {
  const [resumenOpen, setResumenOpen] = useState(true);
  const [pagoOpen, setPagoOpen]       = useState(true);

  // Pago efectivo = suma de las líneas. El saldo pendiente lo resta del total.
  const pagoNum = sumaPagos(pagoLineas);
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
              <span>{totalLabel}</span>
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
                <PagoMetodos
                  lineas={pagoLineas}
                  onChange={(v) => setPagoLineas?.(v)}
                  total={totalNeto}
                  showCuenta
                />

                {/* Fecha — compacta, default hoy, secundaria */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Label className="text-[11px] text-gray-500">Fecha de pago</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs w-auto"
                    value={pagoFecha}
                    onChange={(e) => setPagoFecha?.(e.target.value)}
                  />
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
