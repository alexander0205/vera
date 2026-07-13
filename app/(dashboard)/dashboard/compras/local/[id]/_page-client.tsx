'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, Truck, CalendarClock, FileText, User } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Box
        component={Link}
        href={`/dashboard/productos/${it.productoId}`}
        sx={{
          minWidth: 0, display: 'block', textDecoration: 'none',
          '&:hover .MuiTypography-root:first-of-type': { color: '#0f766e', textDecoration: 'underline' },
        }}
      >
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.productoNombre}</Typography>
        {it.referencia && <Typography sx={{ fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{it.referencia}</Typography>}
      </Box>
    ),
  },
  {
    id: 'cantidad',
    header: 'Cantidad',
    align: 'right',
    render: it => <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{it.cantidad}</Typography>,
  },
  {
    id: 'costoUnitario',
    header: 'Costo unit.',
    align: 'right',
    render: it => <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{fmtDOP(it.costoUnitario)}</Typography>,
  },
  {
    id: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    render: it => <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDOP(it.subtotal)}</Typography>,
  },
];

export default function CompraLocalDetalleClient({ compraId }: { compraId: number }) {
  const { data, isLoading } = useSWR<{ compra?: CompraDetalle; error?: string }>(
    `/api/compras/local/${compraId}`, fetcher,
  );

  const compra = data?.compra;

  if (!isLoading && !compra) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 5, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>{data?.error ?? 'Compra no encontrada.'}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        component={Link}
        href="/dashboard/compras"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none', alignSelf: 'flex-start', '&:hover': { color: '#374151' } }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} /> Compras
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShoppingCart color="#4f46e5" style={{ width: 20, height: 20 }} />
        </Box>
        <Box>
          <Typography component="h1" sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>
            Compra #{compra?.id ?? compraId}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.25 }}>Compra registrada manualmente</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <Tarjeta icon={<Truck color="#7c3aed" style={{ width: 18, height: 18 }} />} bg="#f5f3ff" label="Proveedor">
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{compra?.proveedor ?? '—'}</Typography>
          {compra?.proveedorRnc && <Typography sx={{ display: 'block', fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{compra.proveedorRnc}</Typography>}
        </Tarjeta>
        <Tarjeta icon={<CalendarClock color="#d97706" style={{ width: 18, height: 18 }} />} bg="#fffbeb" label="Fecha">
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{compra ? fmtFechaCorta(compra.fecha) : '—'}</Typography>
        </Tarjeta>
        <Tarjeta icon={<FileText color="#0284c7" style={{ width: 18, height: 18 }} />} bg="#f0f9ff" label="e-NCF referencia">
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#111827' }}>{compra?.referenciaEncf ?? '—'}</Typography>
        </Tarjeta>
        <Tarjeta icon={<User color="#0d9488" style={{ width: 18, height: 18 }} />} bg="#f0fdfa" label="Registrado por">
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{compra?.registradoPor ?? '—'}</Typography>
        </Tarjeta>
      </Box>

      <DataTable<CompraItem>
        data={compra?.items ?? []}
        loading={isLoading}
        columns={columnsItems}
        rowId={it => it.id}
        title="Productos de la compra"
        emptyState={{ icon: ShoppingCart, title: 'Esta compra no tiene ítems', hint: '' }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Total de la compra</Typography>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{compra ? fmtDOP(compra.montoTotal) : '—'}</Typography>
        </Box>
      </Box>

      {compra?.notas && (
        <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 0.5 }}>Notas</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{compra.notas}</Typography>
        </Box>
      )}
    </Box>
  );
}

function Tarjeta({ icon, bg, label, children }: {
  icon: React.ReactNode; bg: string; label: string; children: React.ReactNode;
}) {
  return (
    <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</Typography>
        {children}
      </Box>
    </Box>
  );
}
