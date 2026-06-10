'use client';

import { useState } from 'react';
import { CreditCard, ChevronDown, FileX, User } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface PagoLineaHistorial {
  metodo:     string;
  valor:      string;          // DOP string
  cuenta?:    string;
  referencia?: string;
  fechaPago?: string | null;   // YYYY-MM-DD
  notas?:     string;
  usuario?:   string;
}

export interface PagoData {
  recibido: boolean;
  metodo?: string | null;
  cuenta?: string | null;
  valorDOP: string;            // total pagado (DOP)
  fecha?: string | null;
  /** Historial real del ledger (read-only). */
  lineas?: PagoLineaHistorial[];
}

interface Props {
  initial: PagoData;
  /** Total de la factura — para mostrar saldo en el resumen. */
  totalDOP: string;
}

const METODO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
  cheque:        'Cheque',
  deposito:      'Depósito',
  otro:          'Otro',
};

const metodoLabel = (m: string) =>
  METODO_LABELS[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Pago');

const toCts = (dop: string) => Math.round((parseFloat(dop || '0') || 0) * 100);

/**
 * Right-sidebar "Historial de pagos" card — SOLO LECTURA.
 * Los pagos se registran/editan desde Cuentas por cobrar; aquí solo se consultan.
 */
export function PagoCard({ initial, totalDOP }: Props) {
  const [open, setOpen] = useState(true);

  const lineas = initial.lineas ?? [];
  const pagadoCts = toCts(initial.valorDOP);
  const totalCts  = toCts(totalDOP);
  const saldoCts  = Math.max(totalCts - pagadoCts, 0);

  return (
    <section
      data-pago-card
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 pt-4 pb-3 md:px-5 hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <CreditCard className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-900 flex-1 text-left">Historial de pagos</h2>
        {lineas.length > 0 && (
          <span className="text-[11px] text-gray-400 tabular-nums">{lineas.length}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 md:px-5 space-y-3">
          {lineas.length === 0 ? (
            /* ─── Estado vacío ─── */
            <div className="flex flex-col items-center text-center py-6">
              <FileX className="h-10 w-10 text-gray-300 mb-3" strokeWidth={1.4} />
              <p className="text-sm font-medium text-gray-700">Sin pagos registrados</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[28ch]">
                Los pagos se registran desde Cuentas por cobrar.
              </p>
            </div>
          ) : (
            <>
              {/* ─── Lista de pagos ─── */}
              <ul className="divide-y divide-gray-100">
                {lineas.map((l, i) => (
                  <li key={l.referencia ? `${i}-${l.referencia}` : i} className="py-2.5 first:pt-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-800">
                        {metodoLabel(l.metodo)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {fmtDOP(toCts(l.valor))}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                      {l.fechaPago && <span>{fmtFechaCorta(l.fechaPago)}</span>}
                      {l.usuario && (
                        <>
                          {l.fechaPago && <span aria-hidden="true">·</span>}
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" aria-hidden="true" />
                            {l.usuario}
                          </span>
                        </>
                      )}
                      {l.referencia && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{l.referencia}</span>
                        </>
                      )}
                    </div>
                    {l.notas && (
                      <p className="mt-1 text-[11px] text-gray-600 italic leading-snug">{l.notas}</p>
                    )}
                  </li>
                ))}
              </ul>

              {/* ─── Resumen ─── */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total pagado</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtDOP(pagadoCts)}</span>
                </div>
                {totalCts > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Saldo</span>
                    <span className={`font-semibold tabular-nums ${saldoCts === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmtDOP(saldoCts)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
