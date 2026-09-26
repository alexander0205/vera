'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Eye, Wallet } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { DetallePanel } from '@/components/cuentas-por-cobrar/DetallePanel';
import { PagoModal } from '@/components/cuentas-por-cobrar/PagoModal';

/**
 * Cuentas por cobrar del alumno EN CONTEXTO: la misma información y acciones de
 * la cuenta por cobrar de Facturación (detalle/movimientos y registrar pago),
 * pero abiertas aquí sin sacar a la persona a otra pantalla. Trae las facturas
 * del responsable de pago (la familia) vía `/api/cuentas-por-cobrar?clientId=…`,
 * que devuelve los mismos `Cuenta` que usa Facturación, así que reutiliza tal
 * cual `DetallePanel` y `PagoModal`.
 */
const fetcher = (u: string) => fetch(u).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'Error');
  return j;
});

export function CuentasPorCobrarEscolar({ clientId, puedePagos }: {
  clientId: number | null;
  puedePagos: boolean;
}) {
  const [detalle, setDetalle] = useState<Cuenta | null>(null);
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);
  const { data, isLoading, error, mutate } = useSWR<{ cuentas: Cuenta[] }>(
    clientId ? `/api/cuentas-por-cobrar?clientId=${clientId}` : null,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  if (!clientId) {
    return <div className="py-8 text-center text-sm text-gray-400">Este alumno no tiene responsable de pago asignado.</div>;
  }
  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>;
  }
  if (error) {
    return <div className="py-8 text-center text-sm text-red-600">No se pudieron cargar las cuentas por cobrar.</div>;
  }
  const cuentas = data?.cuentas ?? [];
  if (cuentas.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">Sin facturas por cobrar de esta familia.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-medium">Factura</th>
            <th className="px-3 py-2 font-medium">Emisión</th>
            <th className="px-3 py-2 font-medium text-right">Monto</th>
            <th className="px-3 py-2 font-medium text-right">Pagado</th>
            <th className="px-3 py-2 font-medium text-right">Saldo</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => (
            <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
              <td className="px-3 py-2.5 font-medium text-gray-900">{c.encf || c.codigo || `#${c.id}`}</td>
              <td className="px-3 py-2.5 text-gray-600">{fmtFechaCorta(c.fechaEmision)}</td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(c.montoTotal)}</td>
              <td className="px-3 py-2.5 text-right text-gray-700">
                {c.pagado > 0 ? fmtDOP(c.pagado) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className={c.saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>{fmtDOP(c.saldo)}</span>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {c.vencida ? <span className="font-medium text-red-600">Vencida</span>
                  : c.saldo <= 0 ? 'Pagada'
                  : c.pagado > 0 ? 'Parcial' : 'Pendiente'}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  <button type="button" onClick={() => setDetalle(c)} aria-label="Ver movimientos"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100">
                    <Eye className="h-4 w-4" />
                  </button>
                  {puedePagos && c.saldo > 0 && (
                    <button type="button" onClick={() => setPagoModal(c)} aria-label="Registrar pago"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50">
                      <Wallet className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mismo panel de movimientos y mismo modal de cobro que Facturación, pero
          abiertos en contexto (encima de la ficha, sin redirigir). */}
      {detalle && (
        <DetallePanel
          cuenta={detalle}
          onClose={() => setDetalle(null)}
          onCobrar={() => { setPagoModal(detalle); setDetalle(null); }}
        />
      )}
      {pagoModal && (
        <PagoModal
          cuenta={pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); void mutate(); }}
        />
      )}
    </div>
  );
}
