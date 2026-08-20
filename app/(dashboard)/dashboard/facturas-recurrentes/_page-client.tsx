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

// ─── Fila hija: facturas generadas por el plan (esencial + mora) ──────────────

interface GeneradaEsencial {
  id: number;
  codigo: string | null;
  encf: string;
  fechaEmision: string;
  montoTotal: number;
  estadoPago: string;
  saldo: number;
  moraAplicada: number;
  moraPendiente: number;
}

function cobroBadge(estadoPago: string, moraPendiente: number) {
  // Capital saldado pero con mora impaga → no es "Pagada" del todo.
  if (estadoPago === 'PAGADA' && moraPendiente > 0)
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-orange-100 text-orange-700 border-orange-200 whitespace-nowrap">Mora pendiente</span>;
  if (estadoPago === 'PAGADA')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200 whitespace-nowrap">Pagada</span>;
  if (estadoPago === 'PARCIAL')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 whitespace-nowrap">Parcial</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200 whitespace-nowrap">Pendiente</span>;
}

function RecurrenteHijos({ recurrenteId }: { recurrenteId: number }) {
  const [rows, setRows]     = useState<GeneradaEsencial[] | null>(null);
  const [error, setError]   = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/facturas-recurrentes/${recurrenteId}/generadas`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (vivo) setRows(Array.isArray(d.generadas) ? d.generadas : []); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [recurrenteId]);

  const contenido = (() => {
    if (error) return <p className="text-xs text-red-600">No se pudo cargar el historial.</p>;
    if (rows === null) return (
      <p className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando facturas generadas…
      </p>
    );
    if (rows.length === 0) return <p className="text-xs text-gray-400">Aún no hay facturas generadas.</p>;

    const totalSaldo = rows.reduce((s, g) => s + g.saldo, 0);
    const totalMoraPend = rows.reduce((s, g) => s + g.moraPendiente, 0);

    return (
      <div className="space-y-1.5">
        {rows.map(g => (
          <Link
            key={g.id}
            href={`/dashboard/facturas/${g.id}`}
            className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 hover:border-zero-300 hover:bg-white transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-semibold text-zero-700 truncate">
                {g.codigo ?? (g.encf && !g.encf.startsWith('BOR-') ? g.encf : `#${g.id}`)}
              </span>
              <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">{fmtFechaCorta(g.fechaEmision)}</span>
              {cobroBadge(g.estadoPago, g.moraPendiente)}
            </div>
            <div className="text-right whitespace-nowrap">
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtDOP(g.saldo)}</span>
              {g.moraAplicada > 0 && (
                <p className="text-[11px] text-orange-600">
                  mora {fmtDOP(g.moraAplicada)}
                  {g.moraPendiente > 0 && <span className="text-gray-400"> · {fmtDOP(g.moraPendiente)} pend.</span>}
                </p>
              )}
            </div>
          </Link>
        ))}
        {rows.length > 1 && (
          <div className="flex items-center justify-between gap-3 px-3 pt-1 text-[11px] text-gray-500">
            <span>{rows.length} factura{rows.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">
              Saldo <span className="font-semibold text-gray-800">{fmtDOP(totalSaldo)}</span>
              {totalMoraPend > 0 && <span className="text-orange-600"> · mora pend. {fmtDOP(totalMoraPend)}</span>}
            </span>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="py-1">
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <RefreshCw className="h-4 w-4 text-zero-600 shrink-0" />
          <span className="text-sm font-semibold text-gray-900">Facturas generadas</span>
        </div>
        <div className="p-4">{contenido}</div>
      </div>
    </div>
  );
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
        rowExpandable={f => f.facturasEmitidas > 0}
        renderExpanded={f => <RecurrenteHijos recurrenteId={f.id} />}
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
