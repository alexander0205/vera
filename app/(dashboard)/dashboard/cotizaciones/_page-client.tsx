'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import {
  FileText, Plus, Trash2, AlertTriangle, Pencil,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface Cotizacion {
  id: number;
  numero: string;
  estado: string;
  razonSocialComprador: string | null;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
}

function EstadoChip({ estado }: { estado: string }) {
  switch (estado) {
    case 'borrador':
      return <Chip label="Borrador" size="small" variant="outlined" sx={{ borderColor: '#d1d5db', color: '#4b5563', fontSize: '0.75rem' }} />;
    case 'enviada':
      return <Chip label="Enviada" size="small" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', border: '1px solid #bfdbfe' }} />;
    case 'aceptada':
      return <Chip label="Aceptada" size="small" sx={{ bgcolor: '#16a34a', color: '#fff', fontSize: '0.75rem' }} />;
    case 'rechazada':
      return <Chip label="Rechazada" size="small" sx={{ bgcolor: '#dc2626', color: '#fff', fontSize: '0.75rem' }} />;
    case 'vencida':
      return <Chip label="Vencida" size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', border: '1px solid #fde68a' }} />;
    default:
      return <Chip label={estado} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />;
  }
}

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Cotizacion | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  const search = filterValues.q ?? '';

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/cotizaciones${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setCotizaciones(data.cotizaciones ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(search), 300);
    return () => clearTimeout(t);
  }, [search, cargar]);

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/cotizaciones/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<Cotizacion>[] = useMemo(() => [
    {
      id: 'numero',
      header: 'Número',
      sortable: true,
      render: c => (
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.875rem' }}>
          {c.numero}
        </Typography>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => c.razonSocialComprador
        ? <Typography variant="body2" sx={{ color: '#374151' }}>{c.razonSocialComprador}</Typography>
        : <Typography variant="body2" sx={{ color: '#9ca3af', fontStyle: 'italic' }}>Sin cliente</Typography>,
    },
    {
      id: 'montoTotal',
      header: 'Monto Total',
      align: 'right',
      sortable: true,
      sortAccessor: c => c.montoTotal,
      render: c => (
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {fmtDOP(c.montoTotal)}
        </Typography>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      visibleAt: 'md',
      render: c => <EstadoChip estado={c.estado} />,
    },
    {
      id: 'fechaEmision',
      header: 'Fecha',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.fechaEmision,
      render: c => (
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          {fmtFechaCorta(c.fechaEmision)}
        </Typography>
      ),
    },
  ], []);

  const rowActions = (c: Cotizacion): RowAction[] => [
    { icon: Pencil, title: 'Editar',   href: `/dashboard/cotizaciones/${c.id}/editar` },
    { icon: Trash2, title: 'Eliminar', variant: 'danger', onClick: () => { setDeleteTarget(c); setOpError(null); } },
  ];

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3 }}>
      <DataTable<Cotizacion>
        data={cotizaciones}
        loading={loading}
        columns={columns}
        title="Cotizaciones"
        description="Presupuestos y propuestas para tus clientes"
        filters={[
          { type: 'search', id: 'q', placeholder: 'Buscar por número o cliente…' },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        emptyState={{
          icon: FileText,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin cotizaciones registradas',
          hint: search ? undefined : 'Crea tu primera cotización para enviarla a un cliente',
          cta: search ? undefined : (
            <Link href="/dashboard/cotizaciones/nueva" style={{ textDecoration: 'none' }}>
              <Button
                variant="contained"
                disableElevation
                size="small"
                startIcon={<Plus size={16} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
              >
                Nueva cotización
              </Button>
            </Link>
          ),
        }}
        headerActions={
          <Link href="/dashboard/cotizaciones/nueva" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={<Plus size={18} />}
              sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
            >
              Nueva cotización
            </Button>
          </Link>
        }
      />

      {/* Modal: Confirmar eliminación */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          ¿Eliminar cotización?
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {opError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{opError}</Alert>
          )}
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            Vas a eliminar la cotización{' '}
            <strong>{deleteTarget?.numero}</strong>
            {deleteTarget?.razonSocialComprador ? ` de ${deleteTarget.razonSocialComprador}` : ''}
            . Esta acción no se puede deshacer.
          </Typography>
          <Alert
            severity="warning"
            icon={<AlertTriangle size={16} />}
            sx={{ borderRadius: '8px', fontSize: '0.75rem' }}
          >
            Esta cotización no se convertirá en factura si la eliminas.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disableElevation
            color="error"
            onClick={handleEliminar}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
