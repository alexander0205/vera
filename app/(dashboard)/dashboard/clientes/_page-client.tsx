'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Users, Plus, Pencil, Trash2, Loader2, AlertTriangle,
} from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import { formatTelefonoDO } from '@/lib/utils/format';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '' };
type ClienteForm = typeof EMPTY_FORM;

/**
 * Campo de formulario. Definido FUERA del componente página — si se define
 * adentro, cada render crea una función nueva y React remonta el <Input>,
 * lo que tumba el foco/teclado en cada tecla.
 */
function Field({ label, field, type = 'text', placeholder, form, setForm }: {
  label: string;
  field: keyof ClienteForm;
  type?: string;
  placeholder?: string;
  form: ClienteForm;
  setForm: React.Dispatch<React.SetStateAction<ClienteForm>>;
}) {
  const isTelefono = field === 'telefono';
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        inputMode={isTelefono ? 'tel' : undefined}
        value={form[field]}
        onChange={(e) => {
          const raw = e.target.value;
          const next = isTelefono ? formatTelefonoDO(raw) : raw;
          setForm((f) => ({ ...f, [field]: next }));
        }}
      />
    </div>
  );
}

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Cliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

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

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditTarget(c);
    setForm({
      razonSocial: c.razonSocial,
      rnc:       c.rnc       ?? '',
      email:     c.email     ?? '',
      telefono:  formatTelefonoDO(c.telefono ?? ''),
      direccion: c.direccion ?? '',
    });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.razonSocial.trim()) {
      setOpError('El nombre / razón social es obligatorio');
      return;
    }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/clientes/${editTarget.id}` : '/api/clientes';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/clientes/${deleteTarget.id}`, { method: 'DELETE' });
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

  const columns: DataTableColumn<Cliente>[] = useMemo(() => [
    {
      id: 'razonSocial',
      header: 'Nombre / Razón Social',
      sortable: true,
      render: c => <span className="font-medium text-gray-900">{c.razonSocial}</span>,
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
    { icon: Pencil, title: 'Editar',   onClick: () => abrirEdicion(c) },
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(c); setOpError(null); }, variant: 'danger' },
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
            <Button className="bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
              <Plus className="h-4 w-4 mr-1" />Nuevo cliente
            </Button>
          ),
        }}
        headerActions={
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo cliente
          </Button>
        }
      />

      {/* ── Modal: Crear / Editar ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}

            {/* RNC / Cédula con autocomplete */}
            <div className="space-y-1.5">
              <Label>RNC / Cédula</Label>
              <RncSearch
                placeholder="Buscar RNC, Cédula o razón social…"
                value={form.rnc
                  ? `${form.rnc}${form.razonSocial ? ` · ${form.razonSocial}` : ''}`
                  : undefined
                }
                onSelect={(r) => setForm((f) => ({
                  ...f,
                  rnc: r.rnc,
                  // Auto-fill razón social solo si está vacía
                  razonSocial: f.razonSocial.trim() ? f.razonSocial : r.nombre,
                }))}
                onClear={() => setForm((f) => ({ ...f, rnc: '' }))}
                showSyncHint={false}
              />
            </div>

            <Field label="Nombre / Razón Social *" field="razonSocial" placeholder="Empresa XYZ SRL" form={form} setForm={setForm} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono" field="telefono" placeholder="(809) 000-0000" form={form} setForm={setForm} />
              <Field label="Email" field="email" type="email" placeholder="facturacion@empresa.com" form={form} setForm={setForm} />
            </div>
            <Field label="Dirección" field="direccion" placeholder="Calle, No., Ciudad" form={form} setForm={setForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : (editTarget ? 'Guardar cambios' : 'Crear cliente')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cliente?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
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
