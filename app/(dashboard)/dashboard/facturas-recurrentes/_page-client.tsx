'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  RefreshCw, Plus, Trash2, AlertTriangle, Pencil, PauseCircle, PlayCircle, Zap, Eye, Loader2,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { toast } from 'sonner';

interface FacturaRecurrente {
  id: number;
  nombre: string;
  descripcion: string | null;
  frecuencia: string;
  diaCobro: number | null;
  proximaEmision: string;
  estado: string;
  facturasEmitidas: number;
  totalEstimado: number;
  clienteRazonSocial: string | null;
  clientId: number | null;
}

const FRECUENCIA_LABEL: Record<string, string> = {
  diario:     'Diario',
  semanal:    'Semanal',
  quincenal:  'Quincenal',
  mensual:    'Mensual',
  bimestral:  'Bimestral',
  trimestral: 'Trimestral',
  semestral:  'Semestral',
  anual:      'Anual',
};

function EstadoChip({ estado }: { estado: string }) {
  switch (estado) {
    case 'activa':
      return <Chip label="Activa" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem' }} />;
    case 'pausada':
      return <Chip label="Pausada" size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.6875rem' }} />;
    case 'finalizada':
      return <Chip label="Finalizada" size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#6b7280' }} />;
    default:
      return <Chip label={estado} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />;
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturasRecurrentesPage({ canOperate = true }: { canOperate?: boolean }) {
  const [facturas, setFacturas]         = useState<FacturaRecurrente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FacturaRecurrente | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const [toggling, setToggling]         = useState<number | null>(null);
  const [generando, setGenerando]       = useState<number | null>(null);
  const didLoad                         = useRef(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/facturas-recurrentes');
      const data = await res.json();
      setFacturas(data.facturasRecurrentes ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!didLoad.current) { didLoad.current = true; cargar(); }
  }, [cargar]);

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setOpError(null);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally { setDeleting(false); }
  }

  async function handleToggleEstado(f: FacturaRecurrente) {
    const nuevoEstado = f.estado === 'activa' ? 'pausada' : 'activa';
    setToggling(f.id);
    try {
      await fetch(`/api/facturas-recurrentes/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      setFacturas(prev => prev.map(fr => fr.id === f.id ? { ...fr, estado: nuevoEstado } : fr));
    } finally { setToggling(null); }
  }

  async function handleGenerarAhora(f: FacturaRecurrente) {
    setGenerando(f.id);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${f.id}/generar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error generando factura'); return; }
      toast.success(`Factura generada: ${data.encf}`, {
        action: { label: 'Ver factura', onClick: () => { window.location.href = `/dashboard/facturas/${data.documentoId}`; } },
      });
      cargar();
    } catch {
      toast.error('Error de conexión al generar la factura');
    } finally { setGenerando(null); }
  }

  const columns: DataTableColumn<FacturaRecurrente>[] = useMemo(() => [
    {
      id: 'nombre',
      header: 'Nombre',
      sortable: true,
      render: f => (
        <Box sx={{ maxWidth: 280 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.nombre}
          </Typography>
          {f.descripcion && (
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.descripcion}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'contacto',
      header: 'Contacto',
      visibleAt: 'md',
      render: f => f.clienteRazonSocial
        ? <Typography variant="body2" sx={{ color: '#374151' }}>{f.clienteRazonSocial}</Typography>
        : <Typography variant="body2" sx={{ color: '#9ca3af', fontStyle: 'italic' }}>Sin contacto</Typography>,
    },
    {
      id: 'frecuencia',
      header: 'Frecuencia',
      visibleAt: 'lg',
      render: f => <Typography variant="body2">{FRECUENCIA_LABEL[f.frecuencia] ?? f.frecuencia}</Typography>,
    },
    {
      id: 'proximaEmision',
      header: 'Próxima emisión',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: f => f.proximaEmision,
      render: f => <Typography variant="body2" sx={{ color: '#6b7280' }}>{fmtFechaCorta(f.proximaEmision)}</Typography>,
    },
    {
      id: 'estado',
      header: 'Estado',
      render: f => <EstadoChip estado={f.estado} />,
    },
    {
      id: 'emitidas',
      header: 'Emitidas',
      align: 'center',
      visibleAt: 'md',
      render: f => <Typography variant="body2" sx={{ color: '#6b7280' }}>{f.facturasEmitidas}</Typography>,
    },
    {
      id: 'total',
      header: 'Total estimado',
      align: 'right',
      sortable: true,
      sortAccessor: f => f.totalEstimado,
      render: f => <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDOP(f.totalEstimado)}</Typography>,
    },
  ], []);

  const rowActions = (f: FacturaRecurrente): RowAction[] => {
    const actions: RowAction[] = [
      { icon: Eye,    title: 'Ver',    href: `/dashboard/facturas-recurrentes/${f.id}` },
      { icon: Pencil, title: 'Editar', href: `/dashboard/facturas-recurrentes/${f.id}/editar` },
    ];
    if (canOperate && f.estado !== 'finalizada') {
      const isToggling = toggling === f.id;
      actions.push({
        icon:  isToggling ? Loader2 : (f.estado === 'activa' ? PauseCircle : PlayCircle),
        title: f.estado === 'activa' ? 'Pausar' : 'Reanudar',
        onClick: () => handleToggleEstado(f),
      });
    }
    if (canOperate) {
      const isGenerando = generando === f.id;
      actions.push({
        icon:    isGenerando ? Loader2 : Zap,
        title:   'Generar ahora',
        onClick: () => handleGenerarAhora(f),
      });
      actions.push({
        icon: Trash2, title: 'Eliminar', variant: 'danger',
        onClick: () => { setDeleteTarget(f); setOpError(null); },
      });
    }
    return actions;
  };

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3 }}>
      <DataTable<FacturaRecurrente>
        data={facturas}
        loading={loading}
        columns={columns}
        title="Facturas recurrentes"
        description="Automatiza el ciclo de facturación de tus clientes"
        rowActions={rowActions}
        rowHref={f => `/dashboard/facturas-recurrentes/${f.id}`}
        emptyState={{
          icon: RefreshCw,
          title: 'Sin facturas recurrentes',
          hint: 'Configura una factura recurrente para automatizar tu facturación',
          cta: canOperate ? (
            <Link href="/dashboard/facturas-recurrentes/nueva" style={{ textDecoration: 'none' }}>
              <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
                Nueva factura recurrente
              </Button>
            </Link>
          ) : undefined,
        }}
        headerActions={canOperate ? (
          <Link href="/dashboard/facturas-recurrentes/nueva" style={{ textDecoration: 'none' }}>
            <Button variant="contained" disableElevation startIcon={<Plus size={18} />}
              sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
              Nueva factura recurrente
            </Button>
          </Link>
        ) : undefined}
      />

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar factura recurrente?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {opError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{opError}</Alert>}
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
          </Typography>
          <Alert severity="warning" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
            Las facturas ya emitidas no se verán afectadas.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation color="error" onClick={handleEliminar} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
