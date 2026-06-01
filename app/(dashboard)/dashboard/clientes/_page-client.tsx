'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Users, Plus, Pencil, Trash2, Loader2, AlertTriangle, Upload, X,
} from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import { ImportModal } from '@/components/import-modal';
import { formatTelefonoDO } from '@/lib/utils/format';
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

interface Dependiente {
  id: number;
  nombre: string;
  apellido: string;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '', descripcion: '' };
type ClienteForm = typeof EMPTY_FORM;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const [showImport, setShowImport]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  // Dependientes state
  const [dependientes, setDependientes]   = useState<Dependiente[]>([]);
  const [loadingDeps, setLoadingDeps]     = useState(false);
  const [depForm, setDepForm]             = useState({ nombre: '', apellido: '' });
  const [savingDep, setSavingDep]         = useState(false);
  const [depError, setDepError]           = useState<string | null>(null);
  const [deletingDepId, setDeletingDepId] = useState<number | null>(null);

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

  async function cargarDependientes(clientId: number) {
    setLoadingDeps(true);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${clientId}/dependientes`);
      const data = await res.json();
      setDependientes(data.dependientes ?? []);
    } catch {
      setDepError('Error cargando dependientes');
    } finally {
      setLoadingDeps(false);
    }
  }

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setDependientes([]);
    setDepForm({ nombre: '', apellido: '' });
    setDepError(null);
    setShowForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditTarget(c);
    setForm({
      razonSocial: c.razonSocial,
      rnc:         c.rnc         ?? '',
      email:       c.email       ?? '',
      telefono:    formatTelefonoDO(c.telefono ?? ''),
      direccion:   c.direccion   ?? '',
      descripcion: c.descripcion ?? '',
    });
    setOpError(null);
    setDepForm({ nombre: '', apellido: '' });
    setDepError(null);
    cargarDependientes(c.id);
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

  async function handleAgregarDependiente() {
    if (!editTarget) return;
    if (!depForm.nombre.trim() || !depForm.apellido.trim()) {
      setDepError('Nombre y apellido son obligatorios');
      return;
    }
    setSavingDep(true);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${editTarget.id}/dependientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error agregando dependiente');
      setDepForm({ nombre: '', apellido: '' });
      cargarDependientes(editTarget.id);
    } catch (e: unknown) {
      setDepError(e instanceof Error ? e.message : 'Error agregando dependiente');
    } finally {
      setSavingDep(false);
    }
  }

  async function handleEliminarDependiente(depId: number) {
    if (!editTarget) return;
    setDeletingDepId(depId);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${editTarget.id}/dependientes/${depId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando dependiente');
      cargarDependientes(editTarget.id);
    } catch (e: unknown) {
      setDepError(e instanceof Error ? e.message : 'Error eliminando dependiente');
    } finally {
      setDeletingDepId(null);
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importar de Alegra
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
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

      {/* ── Modal: Crear / Editar ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="datos" className="flex-1">Datos</TabsTrigger>
              <TabsTrigger value="dependientes" className="flex-1">Dependientes</TabsTrigger>
            </TabsList>

            {/* ── Tab: Datos ────────────────────────────────────────────────── */}
            <TabsContent value="datos">
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

                {/* Descripción */}
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[80px]"
                    placeholder="Notas internas, sector, condiciones especiales…"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  />
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
                <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : (editTarget ? 'Guardar cambios' : 'Crear cliente')}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* ── Tab: Dependientes ─────────────────────────────────────────── */}
            <TabsContent value="dependientes">
              <div className="space-y-4 py-2 min-h-[220px]">
                {!editTarget ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-gray-500">
                    <Users className="h-8 w-8 text-gray-300" />
                    <p>Guarda el cliente primero para agregar dependientes.</p>
                  </div>
                ) : (
                  <>
                    {depError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{depError}</div>
                    )}

                    {/* Form para agregar */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">Nombre</Label>
                        <Input
                          placeholder="Nombre"
                          value={depForm.nombre}
                          onChange={(e) => setDepForm((f) => ({ ...f, nombre: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">Apellido</Label>
                        <Input
                          placeholder="Apellido"
                          value={depForm.apellido}
                          onChange={(e) => setDepForm((f) => ({ ...f, apellido: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700 shrink-0"
                        onClick={handleAgregarDependiente}
                        disabled={savingDep}
                      >
                        {savingDep ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Agregar</>}
                      </Button>
                    </div>

                    {/* Lista de dependientes */}
                    {loadingDeps ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : dependientes.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-6">Sin dependientes registrados.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        {dependientes.map((dep) => (
                          <li key={dep.id} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50 text-sm">
                            <span className="font-medium text-gray-800">{dep.nombre} {dep.apellido}</span>
                            <button
                              onClick={() => handleEliminarDependiente(dep.id)}
                              disabled={deletingDepId === dep.id}
                              className="ml-2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Eliminar dependiente"
                            >
                              {deletingDepId === dep.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <X className="h-4 w-4" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
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
