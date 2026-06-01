'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  RefreshCw, Plus, Trash2, Loader2, AlertTriangle, Pencil, PauseCircle, PlayCircle, Zap,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRECUENCIA_LABEL: Record<string, string> = {
  diario:      'Diario',
  semanal:     'Semanal',
  quincenal:   'Quincenal',
  mensual:     'Mensual',
  bimestral:   'Bimestral',
  trimestral:  'Trimestral',
  semestral:   'Semestral',
  anual:       'Anual',
};

function estadoBadge(estado: string) {
  switch (estado) {
    case 'activa':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 border">Activa</Badge>;
    case 'pausada':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 border">Pausada</Badge>;
    case 'finalizada':
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Finalizada</Badge>;
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturasRecurrentesPage() {
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didLoad.current) { didLoad.current = true; cargar(); }
  }, [cargar]);

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
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
    } finally {
      setToggling(null);
    }
  }

  async function handleGenerarAhora(f: FacturaRecurrente) {
    setGenerando(f.id);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${f.id}/generar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Error generando factura');
        return;
      }
      toast.success(
        `Factura generada: ${data.encf}`,
        {
          action: {
            label: 'Ver factura',
            onClick: () => { window.location.href = `/dashboard/facturas/${data.documentoId}`; },
          },
        },
      );
      // Refrescar lista para actualizar "Próxima emisión" y "Emitidas"
      cargar();
    } catch {
      toast.error('Error de conexión al generar la factura');
    } finally {
      setGenerando(null);
    }
  }

  const columns: DataTableColumn<FacturaRecurrente>[] = useMemo(() => [
    {
      id: 'nombre',
      header: 'Nombre',
      sortable: true,
      render: f => (
        <div className="max-w-[280px]">
          <p className="font-medium text-sm text-gray-900 truncate">{f.nombre}</p>
          {f.descripcion && (
            <p className="text-xs text-gray-500 truncate">{f.descripcion}</p>
          )}
        </div>
      ),
    },
    {
      id: 'contacto',
      header: 'Contacto',
      visibleAt: 'md',
      render: f => f.clienteRazonSocial
        ? <span className="text-sm text-gray-700">{f.clienteRazonSocial}</span>
        : <span className="text-sm text-gray-400 italic">Sin contacto</span>,
    },
    {
      id: 'frecuencia',
      header: 'Frecuencia',
      visibleAt: 'lg',
      render: f => <span className="text-sm">{FRECUENCIA_LABEL[f.frecuencia] ?? f.frecuencia}</span>,
    },
    {
      id: 'proximaEmision',
      header: 'Próxima emisión',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: f => f.proximaEmision,
      render: f => <span className="text-sm text-gray-600">{fmtFechaCorta(f.proximaEmision)}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      render: f => estadoBadge(f.estado),
    },
    {
      id: 'emitidas',
      header: 'Emitidas',
      align: 'center',
      visibleAt: 'md',
      render: f => <span className="text-sm text-gray-600">{f.facturasEmitidas}</span>,
    },
    {
      id: 'total',
      header: 'Total estimado',
      align: 'right',
      sortable: true,
      sortAccessor: f => f.totalEstimado,
      render: f => <span className="font-medium text-sm whitespace-nowrap">{fmtDOP(f.totalEstimado)}</span>,
    },
  ], []);

  const rowActions = (f: FacturaRecurrente): RowAction[] => {
    const actions: RowAction[] = [
      { icon: Pencil, title: 'Editar', href: `/dashboard/facturas-recurrentes/${f.id}/editar` },
    ];
    if (f.estado !== 'finalizada') {
      const isToggling = toggling === f.id;
      actions.push({
        icon:  isToggling ? Loader2 : (f.estado === 'activa' ? PauseCircle : PlayCircle),
        title: f.estado === 'activa' ? 'Pausar' : 'Reanudar',
        onClick: () => handleToggleEstado(f),
      });
    }
    // Acción "Generar ahora": disparo manual para probar sin esperar el cron
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
    return actions;
  };

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
      <DataTable<FacturaRecurrente>
        data={facturas}
        loading={loading}
        columns={columns}
        title="Facturas recurrentes"
        description="Automatiza el ciclo de facturación de tus clientes"
        rowActions={rowActions}
        emptyState={{
          icon: RefreshCw,
          title: 'Sin facturas recurrentes',
          hint: 'Configura una factura recurrente para automatizar tu facturación',
          cta: (
            <Link href="/dashboard/facturas-recurrentes/nueva">
              <Button className="bg-teal-600 hover:bg-teal-700" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nueva factura recurrente
              </Button>
            </Link>
          ),
        }}
        headerActions={
          <Link href="/dashboard/facturas-recurrentes/nueva">
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              Nueva factura recurrente
            </Button>
          </Link>
        }
      />

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar factura recurrente?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {opError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Las facturas ya emitidas no se verán afectadas.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</>
                : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
