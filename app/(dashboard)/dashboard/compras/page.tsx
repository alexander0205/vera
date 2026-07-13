'use client';

import useSWR from 'swr';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { ShoppingCart, FileText } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';

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

interface ComprasResponse {
  items?: RecepcionEcfDto[];
  sinContribuyente?: boolean;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

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

export default function ComprasPage() {
  const { can, isLoading: permLoading } = usePermissions();

  const { data, isLoading: swrLoading } = useSWR<ComprasResponse>(
    !permLoading && can('compras:ver') ? '/api/compras' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const loading = permLoading || swrLoading;
  const items   = data?.items ?? [];

  if (!permLoading && !can('compras:ver')) {
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
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ height: 40, width: 40, borderRadius: '12px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShoppingCart size={20} color="#0d9488" />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>Facturas recibidas</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.25 }}>
            e-CF que otros contribuyentes te han emitido y que la DGII reportó a tu empresa.
          </Typography>
        </Box>
      </Box>

      {data?.error && (
        <Alert severity="error" sx={{ borderRadius: '10px' }}>{data.error}</Alert>
      )}

      <DataTable<RecepcionEcfDto>
        data={items}
        loading={loading}
        columns={columns}
        title="Compras"
        emptyState={{
          icon:  data?.sinContribuyente ? ShoppingCart : FileText,
          title: data?.sinContribuyente
            ? 'Tu empresa aún no está registrada para recibir e-CF'
            : 'No has recibido facturas todavía',
          hint: emptyHint,
        }}
      />
    </Box>
  );
}
