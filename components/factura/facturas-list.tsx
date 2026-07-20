/** Lista de facturas — Server-friendly, responsive (cards en móvil / tabla en desktop). */

import Link from 'next/link';
import { Download } from 'lucide-react';
import { fmtMoneda, fmtFecha, type FacturaRow } from '@/lib/factura/core';

const ESTADO_STYLES: Record<string, string> = {
  ACEPTADO:             'bg-green-100 text-green-800',
  ACEPTADO_CONDICIONAL: 'bg-yellow-100 text-yellow-800',
  EN_PROCESO:           'bg-blue-100 text-blue-800',
  RECHAZADO:            'bg-red-100 text-red-800',
  BORRADOR:             'bg-gray-100 text-gray-700',
  ANULADO:              'bg-gray-100 text-gray-500 line-through',
};

// Etiqueta visible por estado (el valor interno BORRADOR se muestra como "Sin comprobante").
const ESTADO_LABEL: Record<string, string> = {
  ACEPTADO:             'Aceptado',
  ACEPTADO_CONDICIONAL: 'Aceptado condicional',
  EN_PROCESO:           'En proceso',
  RECHAZADO:            'Rechazado',
  BORRADOR:             'Sin comprobante',
  ANULADO:              'Anulado',
};

function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
        ESTADO_STYLES[estado] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}

export function FacturasList({ facturas }: { facturas: FacturaRow[] }) {
  if (facturas.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center text-sm text-gray-500">
        Aún no has emitido facturas. Cuando emitas una, aparecerá aquí.
      </div>
    );
  }

  return (
    <>
      {/* ─── Móvil: cards ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {facturas.map(f => (
          <div key={f.id} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-gray-700 break-all">{f.encf}</span>
              <EstadoBadge estado={f.estado} />
            </div>
            <div className="text-sm text-gray-900 truncate">
              {f.razonSocialComprador ?? <span className="text-gray-400">Consumidor final</span>}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-500">{fmtFecha(f.createdAt)}</span>
              <span className="text-sm font-medium text-gray-900">
                {fmtMoneda(f.montoTotal / 100)}
              </span>
            </div>
            <Link
              href={`/api/pdf/factura/${f.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-xs pt-1"
            >
              <Download className="w-3.5 h-3.5" /> Descargar PDF
            </Link>
          </div>
        ))}
      </div>

      {/* ─── Desktop: tabla ───────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">e-NCF</th>
              <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-center font-medium">Estado</th>
              <th className="px-4 py-2.5 text-right font-medium w-20">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {facturas.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{f.encf}</td>
                <td className="px-4 py-3 text-gray-900 truncate max-w-xs">
                  {f.razonSocialComprador ?? <span className="text-gray-400">Consumidor final</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtFecha(f.createdAt)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmtMoneda(f.montoTotal / 100)}</td>
                <td className="px-4 py-3 text-center">
                  <EstadoBadge estado={f.estado} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/api/pdf/factura/${f.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-xs"
                    title="Descargar PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
