'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, Truck, CalendarClock, FileText, User } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta, fmtDOP } from '@/lib/utils/format';

interface CompraItem {
  id:             number;
  productoId:     number;
  productoNombre: string;
  referencia:     string | null;
  cantidad:       number;
  costoUnitario:  number;   // centavos
  subtotal:       number;   // centavos
}

interface CompraDetalle {
  id:             number;
  fecha:          string;
  proveedor:      string;
  proveedorRnc:   string | null;
  referenciaEncf: string | null;
  notas:          string | null;
  montoTotal:     number;   // centavos
  registradoPor:  string;
  items:          CompraItem[];
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const columnsItems: DataTableColumn<CompraItem>[] = [
  {
    id: 'producto',
    header: 'Producto',
    render: it => (
      <Link href={`/dashboard/productos/${it.productoId}`} className="min-w-0 block group">
        <div className="text-sm text-gray-900 truncate group-hover:text-teal-700 group-hover:underline">{it.productoNombre}</div>
        {it.referencia && <div className="font-mono text-[11px] text-gray-400">{it.referencia}</div>}
      </Link>
    ),
  },
  {
    id: 'cantidad',
    header: 'Cantidad',
    align: 'right',
    render: it => <span className="text-sm tabular-nums text-gray-700">{it.cantidad}</span>,
  },
  {
    id: 'costoUnitario',
    header: 'Costo unit.',
    align: 'right',
    render: it => <span className="text-sm tabular-nums text-gray-700">{fmtDOP(it.costoUnitario)}</span>,
  },
  {
    id: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    render: it => <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{fmtDOP(it.subtotal)}</span>,
  },
];

export default function CompraLocalDetalleClient({ compraId }: { compraId: number }) {
  const { data, isLoading } = useSWR<{ compra?: CompraDetalle; error?: string }>(
    `/api/compras/local/${compraId}`, fetcher,
  );

  const compra = data?.compra;

  if (!isLoading && !compra) {
    return (
      <section className="p-4 sm:p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">{data?.error ?? 'Compra no encontrada.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-4 sm:p-6 space-y-4">
      <Link href="/dashboard/compras" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Compras
      </Link>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <ShoppingCart className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            Compra #{compra?.id ?? compraId}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Compra registrada manualmente</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta icon={<Truck className="h-4.5 w-4.5 text-violet-600" />} bg="bg-violet-50" label="Proveedor">
          <span className="text-sm font-bold text-gray-900">{compra?.proveedor ?? '—'}</span>
          {compra?.proveedorRnc && <span className="block font-mono text-[11px] text-gray-400">{compra.proveedorRnc}</span>}
        </Tarjeta>
        <Tarjeta icon={<CalendarClock className="h-4.5 w-4.5 text-amber-600" />} bg="bg-amber-50" label="Fecha">
          <span className="text-sm font-bold text-gray-900">{compra ? fmtFechaCorta(compra.fecha) : '—'}</span>
        </Tarjeta>
        <Tarjeta icon={<FileText className="h-4.5 w-4.5 text-sky-600" />} bg="bg-sky-50" label="e-NCF referencia">
          <span className="font-mono text-xs font-bold text-gray-900">{compra?.referenciaEncf ?? '—'}</span>
        </Tarjeta>
        <Tarjeta icon={<User className="h-4.5 w-4.5 text-teal-600" />} bg="bg-teal-50" label="Registrado por">
          <span className="text-sm font-bold text-gray-900">{compra?.registradoPor ?? '—'}</span>
        </Tarjeta>
      </div>

      <DataTable<CompraItem>
        data={compra?.items ?? []}
        loading={isLoading}
        columns={columnsItems}
        rowId={it => it.id}
        title="Productos de la compra"
        emptyState={{ icon: ShoppingCart, title: 'Esta compra no tiene ítems', hint: '' }}
      />

      <div className="flex justify-end">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 flex items-center gap-6">
          <span className="text-sm text-gray-500">Total de la compra</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{compra ? fmtDOP(compra.montoTotal) : '—'}</span>
        </div>
      </div>

      {compra?.notas && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">Notas</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{compra.notas}</p>
        </div>
      )}
    </section>
  );
}

function Tarjeta({ icon, bg, label, children }: {
  icon: React.ReactNode; bg: string; label: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-3">
      <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {children}
      </div>
    </div>
  );
}
