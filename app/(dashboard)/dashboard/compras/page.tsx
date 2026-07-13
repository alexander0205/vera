'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ShoppingCart, FileText, Plus, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta, fmtDOP } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';
import type { CompraLocal } from '@/lib/db/schema';
import ModalRegistrarCompra from './_modal-registrar-compra';

const ESTADO_CHIP: Record<string, { label: string; bgcolor: string; color: string; border: string }> = {
  ACEPTADO:             { label: 'Aceptado',    bgcolor: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', bgcolor: '#fffbeb', color: '#92400e', border: '#fde68a' },
  RECHAZADO:            { label: 'Rechazado',   bgcolor: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  RECIBIDO:             { label: 'Recibido',    bgcolor: '#e0f2fe', color: '#0c4a6e', border: '#7dd3fc' },
  PENDIENTE:            { label: 'Pendiente',   bgcolor: '#f3f4f6', color: '#4b5563', border: '#d1d5db' },
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único',   '45': 'Gub.',    '46': 'Export.', '47': 'Otros',
};

export function tipoFromEncf(item: RecepcionEcfDto): string {
  const code = item.tipoECF || item.tipoComprobante || item.eNcf?.match(/^E(\d{2})/)?.[1] || '';
  return code ? (TIPO_LABELS[code] ?? `e${code}`) : '—';
}

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
      <Link href={`/dashboard/compras/${item.id}`} style={{ textDecoration: 'none' }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#0f766e', '&:hover': { textDecoration: 'underline' } }}>
          {item.rncEmisor ?? item.rnc}
        </Typography>
      </Link>
    ),
  },
  {
    id: 'encf',
    header: 'e-NCF',
    render: item => (
      <Link href={`/dashboard/compras/${item.id}`} style={{ textDecoration: 'none' }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151', '&:hover': { textDecoration: 'underline' } }}>
          {item.eNcf}
        </Typography>
      </Link>
    ),
  },
  {
    id: 'tipo',
    header: 'Tipo',
    visibleAt: 'md',
    render: item => <Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{tipoFromEncf(item)}</Typography>,
  },
  {
    id: 'fecha',
    header: 'Fecha',
    visibleAt: 'md',
    render: item => (
      <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {fmtFechaCorta(item.fechaRecepcion ?? item.createdAt)}
      </Typography>
    ),
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    render: item => {
      const estado = item.estado ?? 'PENDIENTE';
      const chip = ESTADO_CHIP[estado] ?? { label: estado, bgcolor: '#f3f4f6', color: '#6b7280', border: '#d1d5db' };
      return (
        <Chip label={chip.label} size="small" sx={{ bgcolor: chip.bgcolor, color: chip.color, border: `1px solid ${chip.border}`, fontSize: '0.6875rem', fontWeight: 500 }} />
      );
    },
  },
  {
    id: 'monto',
    header: 'Monto',
    align: 'right',
    render: item => (
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {fmtMonto(item)}
      </Typography>
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
      <Box sx={{ p: 3 }}>
        <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', bgcolor: '#fff', p: 5, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>No tienes permiso para ver esta sección.</Typography>
        </Box>
      </Box>
    );
  }

  const emptyHint = data?.sinContribuyente
    ? 'Configura el certificado digital y regístrate en la DGII para comenzar a recibir facturas electrónicas.'
    : 'Aquí aparecerán las e-CF que tus proveedores te emitan.';

  return (
    <section className="p-4 sm:p-6 space-y-4">
      {/* Header tipo Alegra */}
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
        <Alert severity="error" sx={{ borderRadius: '10px' }}>{data.error}</Alert>
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
