'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ShoppingCart, FileText, Plus, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta, fmtDOP } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';
import type { CompraLocal } from '@/lib/db/schema';
import ModalRegistrarCompra from './_modal-registrar-compra';

// ─── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO:             'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ACEPTADO_CONDICIONAL: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  RECHAZADO:            'bg-red-50 text-red-700 ring-1 ring-red-200',
  RECIBIDO:             'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  PENDIENTE:            'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único',   '45': 'Gub.',    '46': 'Export.', '47': 'Otros',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tipo e-CF: viene null en `tipoECF`; el real está en el e-NCF (E31… → "31"). */
export function tipoFromEncf(item: RecepcionEcfDto): string {
  const code = item.tipoECF || item.tipoComprobante || item.eNcf?.match(/^E(\d{2})/)?.[1] || '';
  return code ? (TIPO_LABELS[code] ?? `e${code}`) : '—';
}

/** El monto NO viene como campo del API — se extrae del XML firmado (<MontoTotal>, en pesos). */
export function montoFromXml(xml?: string): number | null {
  if (!xml) return null;
  const m = xml.match(/<MontoTotal>\s*([\d.]+)\s*<\/MontoTotal>/i);
  return m ? Number(m[1]) : null;
}

function fmtMonto(item: RecepcionEcfDto): string {
  const v = montoFromXml(item.xmlFirmado ?? item.xmlOriginal);
  if (v === null) return '—';
  return `RD$${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── API response shapes ──────────────────────────────────────────────────────

interface ComprasResponse {
  items?: RecepcionEcfDto[];
  sinContribuyente?: boolean;
  error?: string;
}

interface ComprasLocalesResponse {
  compras?: CompraLocal[];
  error?: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Columns: e-CF recibidas ────────────────────────────────────────────────────

const columns: DataTableColumn<RecepcionEcfDto>[] = [
  {
    id: 'emisor',
    header: 'Emisor (RNC)',
    render: item => (
      <Link
        href={`/dashboard/compras/${item.id}`}
        className="font-mono text-xs text-teal-700 hover:underline font-semibold"
      >
        {item.rncEmisor ?? item.rnc}
      </Link>
    ),
  },
  {
    id: 'encf',
    header: 'e-NCF',
    render: item => (
      <Link
        href={`/dashboard/compras/${item.id}`}
        className="font-mono text-xs text-gray-700 hover:underline"
      >
        {item.eNcf}
      </Link>
    ),
  },
  {
    id: 'tipo',
    header: 'Tipo',
    visibleAt: 'md',
    render: item => (
      <span className="text-xs text-gray-600">{tipoFromEncf(item)}</span>
    ),
  },
  {
    id: 'fecha',
    header: 'Fecha',
    visibleAt: 'md',
    render: item => (
      <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap">
        {fmtFechaCorta(item.fechaRecepcion ?? item.createdAt)}
      </span>
    ),
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    render: item => {
      const estado = item.estado ?? 'PENDIENTE';
      return (
        <span
          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}
        >
          {estado}
        </span>
      );
    },
  },
  {
    id: 'monto',
    header: 'Monto',
    align: 'right',
    render: item => (
      <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">
        {fmtMonto(item)}
      </span>
    ),
  },
];

// ─── Columns: compras registradas (locales) ──────────────────────────────────

const columnsLocales: DataTableColumn<CompraLocal>[] = [
  {
    id: 'fecha',
    header: 'Fecha',
    render: c => (
      <span className="text-xs text-gray-700 tabular-nums whitespace-nowrap">
        {fmtFechaCorta(c.fecha)}
      </span>
    ),
  },
  {
    id: 'proveedor',
    header: 'Proveedor',
    render: c => (
      <div className="min-w-0">
        <div className="text-sm text-gray-900 truncate">{c.proveedorNombre ?? '—'}</div>
        {c.proveedorRnc && (
          <div className="font-mono text-[11px] text-gray-400">{c.proveedorRnc}</div>
        )}
      </div>
    ),
  },
  {
    id: 'referencia',
    header: 'e-NCF',
    visibleAt: 'md',
    render: c => (
      <span className="font-mono text-xs text-gray-600">{c.referenciaEncf ?? '—'}</span>
    ),
  },
  {
    id: 'monto',
    header: 'Monto',
    align: 'right',
    render: c => (
      <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">
        {fmtDOP(c.montoTotal)}
      </span>
    ),
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ComprasPage() {
  const { can, isLoading: permLoading } = usePermissions();
  const [showModal, setShowModal] = useState(false);

  const canVerRecibidas = can('compras:ver');
  const canRegistrar    = can('productos:gestionar');
  const canVerLocales   = canRegistrar || can('productos:ver');

  const { data, isLoading: swrLoading } = useSWR<ComprasResponse>(
    !permLoading && canVerRecibidas ? '/api/compras' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: locales, isLoading: localesLoading, mutate: mutateLocales } =
    useSWR<ComprasLocalesResponse>(
      !permLoading && canVerLocales ? '/api/compras/local' : null,
      fetcher,
      { revalidateOnFocus: false },
    );

  const loading        = permLoading || swrLoading;
  const items          = data?.items ?? [];
  const comprasLocales = locales?.compras ?? [];

  // ── Estados especiales ──
  if (!permLoading && !canVerRecibidas && !canVerLocales) {
    return (
      <section className="p-4 sm:p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No tienes permiso para ver esta sección.</p>
        </div>
      </section>
    );
  }

  // Hint text según estado
  const emptyHint = data?.sinContribuyente
    ? 'Configura el certificado digital y regístrate en la DGII para comenzar a recibir facturas electrónicas.'
    : 'Aquí aparecerán las e-CF que tus proveedores te emitan.';

  return (
    <section className="p-4 sm:p-6 space-y-4">
      {/* Header del listado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Compras</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              e-CF recibidas de tus proveedores y compras que registras manualmente.
            </p>
          </div>
        </div>
        {canRegistrar && (
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva compra
          </Button>
        )}
      </div>

      <ModalRegistrarCompra
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => mutateLocales()}
      />

      {data?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{data.error}</p>
        </div>
      )}

      <Tabs defaultValue={canVerRecibidas ? 'recibidas' : 'registradas'}>
        <TabsList>
          {canVerRecibidas && (
            <TabsTrigger value="recibidas">Facturas recibidas</TabsTrigger>
          )}
          {canVerLocales && (
            <TabsTrigger value="registradas">
              Compras registradas
              {comprasLocales.length > 0 && (
                <span className="ml-1.5 text-[11px] text-gray-400">({comprasLocales.length})</span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {canVerRecibidas && (
          <TabsContent value="recibidas">
            <DataTable<RecepcionEcfDto>
              data={items}
              loading={loading}
              columns={columns}
              title="e-CF recibidas"
              emptyState={{
                icon:  data?.sinContribuyente ? ShoppingCart : FileText,
                title: data?.sinContribuyente
                  ? 'Tu empresa aún no está registrada para recibir e-CF'
                  : 'No has recibido facturas todavía',
                hint: emptyHint,
              }}
            />
          </TabsContent>
        )}

        {canVerLocales && (
        <TabsContent value="registradas">
          <DataTable<CompraLocal>
            data={comprasLocales}
            loading={permLoading || localesLoading}
            columns={columnsLocales}
            rowHref={c => `/dashboard/compras/local/${c.id}`}
            title="Compras registradas"
            emptyState={{
              icon:  PackagePlus,
              title: 'No has registrado compras manuales',
              hint:  'Usa "Nueva compra" para registrar entradas de inventario y actualizar tu stock.',
            }}
          />
        </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
