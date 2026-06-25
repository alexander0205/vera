'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Users, Plus, Pencil, Trash2, Loader2, AlertTriangle, Upload,
} from 'lucide-react';
import { ImportModal } from '@/components/import-modal';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  descripcion: string | null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [delError, setDelError]         = useState<string | null>(null);

  const search = filterValues.q ?? '';

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setClientes(data.clientes ?? []);
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
    setDelError(null);
    try {
      const res  = await fetch(`/api/clientes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search);
    } catch (e: unknown) {
      setDelError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<Cliente>[] = useMemo(() => [
    {
      id: 'razonSocial',
      header: 'Nombre / Razón Social',
      sortable: true,
      render: c => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-semibold uppercase">
            {initials(c.razonSocial)}
          </span>
          <span className="font-medium text-gray-900">{c.razonSocial}</span>
        </div>
      ),
    },
    {
      id: 'rnc',
      header: 'RNC / Cédula',
      visibleAt: 'md',
      render: c => <span className="font-mono text-sm text-gray-600">{c.rnc ?? '—'}</span>,
    },
    {
      id: 'email',
      header: 'Email',
      visibleAt: 'lg',
      render: c => <span className="text-sm text-gray-600">{c.email ?? '—'}</span>,
    },
    {
      id: 'telefono',
      header: 'Teléfono',
      visibleAt: 'lg',
      render: c => <span className="text-sm text-gray-600">{c.telefono ?? '—'}</span>,
    },
  ], []);

  const rowActions = (c: Cliente): RowAction[] => [
    { icon: Pencil, title: 'Editar',   onClick: () => router.push(`/dashboard/clientes/${c.id}/editar`) },
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(c); setDelError(null); }, variant: 'danger' },
  ];

  return (
    <section className="p-6 space-y-6">
      <DataTable<Cliente>
        data={clientes}
        loading={loading}
        columns={columns}
        title="Clientes"
        description="Directorio de compradores y contactos"
        filters={[
          { type: 'search', id: 'q', placeholder: 'Buscar por nombre, RNC o email…' },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        emptyState={{
          icon: Users,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados',
          hint: search ? undefined : 'Crea tu primer cliente o aparecerán automáticamente al emitir facturas',
          cta: search ? undefined : (
            <Button className="bg-teal-600 hover:bg-teal-700" size="sm" onClick={() => router.push('/dashboard/clientes/nuevo')}>
              <Plus className="h-4 w-4 mr-1" />Nuevo cliente
            </Button>
          ),
        }}
        headerActions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importar de Alegra
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => router.push('/dashboard/clientes/nuevo')}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo cliente
            </Button>
          </div>
        }
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        endpoint="/api/import/clientes"
        title="Importar clientes de Alegra"
        helpText="Archivo CSV exportado de Alegra (Contactos). Se omiten duplicados por RNC o nombre."
        columns={[
          { key: 'razonSocial', label: 'Nombre / Razón Social' },
          { key: 'rnc',         label: 'RNC / Cédula' },
          { key: 'email',       label: 'Email' },
          { key: 'telefono',    label: 'Teléfono' },
        ]}
        onDone={() => cargar(search)}
      />

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cliente?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {delError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{delError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar a <strong>{deleteTarget?.razonSocial}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Las facturas emitidas a este cliente no se verán afectadas.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</> : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
