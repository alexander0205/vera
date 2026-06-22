'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Package, ShoppingBag, TrendingUp, CalendarClock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta, fmtDOP } from '@/lib/utils/format';

interface Producto {
  id:                   number;
  nombre:               string;
  descripcion:          string | null;
  referencia:           string | null;
  precioDOP:            number;
  costoDOP:             number;
  tasaItbis:            string;
  tipo:                 string;
  activo:               string;
  unidadMedida:         string;
  stockActual:          number;
  stockMinimo:          number;
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
}

interface VentaProducto {
  movimientoId:      number;
  ecfId:              number;
  encf:                string;
  estado:              string;
  fecha:               string;
  cliente:             string;
  vendedor:            string;
  cantidad:            number;
  precioUnitario:      number | null;
  subtotal:            number | null;
  montoTotalFactura:   number;
}

const TASA_LABELS: Record<string, string> = {
  '0.18': 'ITBIS 18%', '0.16': 'ITBIS 16%', '0': 'ITBIS 0%', exento: 'Exento',
};

const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO:             'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ACEPTADO_CONDICIONAL: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  RECHAZADO:            'bg-red-50 text-red-700 ring-1 ring-red-200',
  EN_PROCESO:           'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  BORRADOR:             'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  ANULADO:              'bg-gray-100 text-gray-400 ring-1 ring-gray-200 line-through',
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

const columnsVentas: DataTableColumn<VentaProducto>[] = [
  {
    id: 'encf',
    header: 'e-NCF',
    render: v => (
      <Link href={`/dashboard/facturas/${v.ecfId}`} className="font-mono text-xs text-teal-700 hover:underline font-semibold">
        {v.encf}
      </Link>
    ),
  },
  {
    id: 'fecha',
    header: 'Fecha',
    visibleAt: 'md',
    render: v => <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap">{fmtFechaCorta(v.fecha)}</span>,
  },
  {
    id: 'cliente',
    header: 'Cliente',
    render: v => <span className="text-sm text-gray-900 truncate">{v.cliente}</span>,
  },
  {
    id: 'vendedor',
    header: 'Vendedor',
    visibleAt: 'lg',
    render: v => <span className="text-xs text-gray-600">{v.vendedor}</span>,
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    render: v => (
      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${ESTADO_BADGE[v.estado] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}>
        {v.estado}
      </span>
    ),
  },
  {
    id: 'cantidad',
    header: 'Cant.',
    align: 'right',
    render: v => <span className="text-sm tabular-nums text-gray-700">{v.cantidad}</span>,
  },
  {
    id: 'precioUnitario',
    header: 'Precio unit.',
    align: 'right',
    visibleAt: 'md',
    render: v => (
      <span className="text-sm tabular-nums text-gray-700">
        {v.precioUnitario !== null ? `RD$${v.precioUnitario.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    ),
  },
  {
    id: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    render: v => (
      <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
        {v.subtotal !== null ? `RD$${v.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    ),
  },
];

export default function ProductoDetalleClient({ productoId }: { productoId: number }) {
  const { data: prodData, isLoading: loadingProd } = useSWR<{ producto?: Producto; error?: string }>(
    `/api/productos/${productoId}`, fetcher,
  );
  const { data: ventasData, isLoading: loadingVentas } = useSWR<{ ventas?: VentaProducto[]; error?: string }>(
    `/api/productos/${productoId}/ventas`, fetcher,
  );

  const producto = prodData?.producto;
  const ventas    = ventasData?.ventas ?? [];

  const resumen = useMemo(() => {
    const unidades   = ventas.reduce((acc, v) => acc + v.cantidad, 0);
    const totalVendido = ventas.reduce((acc, v) => acc + (v.subtotal ?? 0), 0);
    const ultimaVenta  = ventas[0]?.fecha ?? null;
    return { unidades, totalVendido, ultimaVenta };
  }, [ventas]);

  if (!loadingProd && !producto) {
    return (
      <section className="p-4 sm:p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">{prodData?.error ?? 'Producto no encontrado.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-4 sm:p-6 space-y-4">
      <Link href="/dashboard/productos" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Productos
      </Link>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
          <Package className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{producto?.nombre ?? '—'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{producto?.referencia ? `Ref. ${producto.referencia}` : 'Sin referencia'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total vendido</p>
            <p className="text-sm font-bold text-gray-900">
              RD${resumen.totalVendido.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-4.5 w-4.5 text-sky-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Unidades vendidas</p>
            <p className="text-sm font-bold text-gray-900">{resumen.unidades}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <CalendarClock className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Última venta</p>
            <p className="text-sm font-bold text-gray-900">{resumen.ultimaVenta ? fmtFechaCorta(resumen.ultimaVenta) : '—'}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="detalle">
        <TabsList>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
          <TabsTrigger value="ventas">
            Historial de ventas
            {ventas.length > 0 && <span className="ml-1.5 text-[11px] text-gray-400">({ventas.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detalle">
          <div className="rounded-xl border border-gray-200 bg-white p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Campo label="Tipo" valor={producto?.tipo === 'bien' ? 'Producto' : 'Servicio'} />
            <Campo label="Precio" valor={producto ? `RD$${producto.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'} />
            <Campo label="Costo" valor={producto ? `RD$${producto.costoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'} />
            <Campo label="ITBIS" valor={producto ? (TASA_LABELS[producto.tasaItbis] ?? producto.tasaItbis) : '—'} />
            <Campo label="Unidad" valor={producto?.unidadMedida ?? '—'} />
            <Campo label="Estado" valor={producto?.activo === 'true' ? 'Activo' : 'Inactivo'} />
            {producto?.controlaInventario && (
              <>
                <Campo label="Stock actual" valor={String(producto.stockActual)} />
                <Campo label="Stock mínimo" valor={String(producto.stockMinimo)} />
                <Campo label="Venta sin stock" valor={producto.permiteVentaSinStock ? 'Permitida' : 'Bloqueada'} />
              </>
            )}
            {producto?.descripcion && (
              <div className="col-span-2 sm:col-span-3">
                <Campo label="Descripción" valor={producto.descripcion} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ventas">
          <DataTable<VentaProducto>
            data={ventas}
            loading={loadingVentas}
            columns={columnsVentas}
            rowId={v => v.movimientoId}
            title="Facturas con este producto"
            emptyState={{
              icon:  ShoppingBag,
              title: 'Sin ventas registradas todavía',
              hint:  'Aquí aparecerán las facturas guardadas o emitidas que incluyan este producto.',
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{valor}</p>
    </div>
  );
}
