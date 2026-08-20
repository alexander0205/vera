'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  FileText, Plus, Trash2, Loader2, AlertTriangle, Pencil, Mail, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { Input } from '@/components/ui/input';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface Cotizacion {
  id: number;
  numero: string;
  estado: string;
  razonSocialComprador: string | null;
  emailComprador: string | null;
  /** Correo de la ficha del cliente. Solo para proponer destinatario. */
  emailCliente?: string | null;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
}

function estadoBadge(estado: string) {
  switch (estado) {
    case 'borrador':
      return <Badge variant="outline" className="text-gray-600 border-gray-300">Borrador</Badge>;
    case 'enviada':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">Enviada</Badge>;
    case 'aceptada':
      return <Badge className="bg-green-600 hover:bg-green-600 text-white">Aceptada</Badge>;
    case 'rechazada':
      return <Badge variant="destructive">Rechazada</Badge>;
    case 'vencida':
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">Vencida</Badge>;
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
}

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones]   = useState<Cotizacion[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterValues, setFilterValues]   = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget]   = useState<Cotizacion | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [opError, setOpError]             = useState<string | null>(null);
  const [emailTarget, setEmailTarget]     = useState<{ cot: Cotizacion; email: string } | null>(null);
  const [sendingEmail, setSendingEmail]   = useState(false);

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

  // Debounce search
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

  /**
   * Envía la cotización por correo. Igual que en el detalle: si seguía en
   * borrador, pasa a "enviada" — se acaba de mandar, ya no es un borrador.
   */
  async function handleEnviarEmail() {
    if (!emailTarget) return;
    setSendingEmail(true);
    try {
      const res  = await fetch(`/api/cotizaciones/${emailTarget.cot.id}/email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: emailTarget.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error enviando email');

      if (emailTarget.cot.estado === 'borrador') {
        await fetch(`/api/cotizaciones/${emailTarget.cot.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ estado: 'enviada' }),
        });
      }

      toast.success('Cotización enviada por correo');
      setEmailTarget(null);
      cargar(search);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error enviando email');
    } finally {
      setSendingEmail(false);
    }
  }

  const columns: DataTableColumn<Cotizacion>[] = useMemo(() => [
    {
      id: 'numero',
      header: 'Número',
      sortable: true,
      render: c => (
        <Link
          href={`/dashboard/cotizaciones/${c.id}`}
          className="font-mono font-medium text-sm text-zero-700 underline decoration-zero-200 underline-offset-2 hover:decoration-zero-600"
        >
          {c.numero}
        </Link>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => c.razonSocialComprador
        ? <span className="text-gray-700">{c.razonSocialComprador}</span>
        : <span className="text-gray-400 italic">Sin cliente</span>,
    },
    {
      id: 'montoTotal',
      header: 'Monto Total',
      align: 'right',
      sortable: true,
      sortAccessor: c => c.montoTotal,
      render: c => <span className="font-medium whitespace-nowrap">{fmtDOP(c.montoTotal)}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      visibleAt: 'md',
      render: c => estadoBadge(c.estado),
    },
    {
      id: 'fechaEmision',
      header: 'Fecha',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.fechaEmision,
      render: c => <span className="text-sm text-gray-600">{fmtFechaCorta(c.fechaEmision)}</span>,
    },
  ], []);

  const rowActions = (c: Cotizacion): RowAction[] => [
    // El detalle es donde vive "Convertir a factura"; sin esta puerta había que
    // adivinar que el número era un enlace.
    { icon: Eye,    title: 'Ver detalle', href: `/dashboard/cotizaciones/${c.id}`, primary: true },
    { icon: Mail,   title: 'Enviar por correo', onClick: () => setEmailTarget({ cot: c, email: c.emailComprador || c.emailCliente || '' }) },
    { icon: Pencil, title: 'Editar',   href: `/dashboard/cotizaciones/${c.id}/editar` },
    { icon: Trash2, title: 'Eliminar', variant: 'danger', onClick: () => { setDeleteTarget(c); setOpError(null); } },
  ];

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
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
        rowHref={c => `/dashboard/cotizaciones/${c.id}`}
        rowActions={rowActions}
        emptyState={{
          icon: FileText,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin cotizaciones registradas',
          hint: search ? undefined : 'Crea tu primera cotización para enviarla a un cliente',
          cta: search ? undefined : (
            <Link href="/dashboard/cotizaciones/nueva">
              <Button className="bg-zero-600 hover:bg-zero-700" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nueva cotización
              </Button>
            </Link>
          ),
        }}
        headerActions={
          <Link href="/dashboard/cotizaciones/nueva">
            <Button className="bg-zero-600 hover:bg-zero-700">
              <Plus className="h-4 w-4 mr-2" />
              Nueva cotización
            </Button>
          </Link>
        }
      />

      {/* ── Modal: Enviar por correo ──────────────────────────────────────────── */}
      <Dialog open={!!emailTarget} onOpenChange={(o: boolean) => { if (!o) setEmailTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar cotización por correo</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Se enviará la cotización <strong>{emailTarget?.cot.numero}</strong> con el PDF adjunto.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Correo del cliente</label>
              <Input
                type="email"
                value={emailTarget?.email ?? ''}
                onChange={e => setEmailTarget(t => t && { ...t, email: e.target.value })}
                placeholder="cliente@empresa.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={sendingEmail}>
              Cancelar
            </Button>
            <Button
              className="bg-zero-600 hover:bg-zero-700"
              onClick={handleEnviarEmail}
              disabled={sendingEmail || !emailTarget?.email}
            >
              {sendingEmail
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</>
                : <><Mail className="h-4 w-4 mr-1" />Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cotización?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {opError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar la cotización{' '}
              <strong>{deleteTarget?.numero}</strong>
              {deleteTarget?.razonSocialComprador
                ? ` de ${deleteTarget.razonSocialComprador}`
                : ''}
              . Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Esta cotización no se convertirá en factura si la eliminas.</span>
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
