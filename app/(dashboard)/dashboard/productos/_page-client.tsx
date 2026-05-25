'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, Check, ChevronDown, ChevronUp, Upload,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';

interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  referencia: string | null;
  precio: number;       // centavos
  precioDOP: number;    // DOP
  tasaItbis: string;
  tipo: string;
  activo: string;
}

const TASA_LABELS: Record<string, string> = {
  '0.18': 'ITBIS 18%',
  '0.16': 'ITBIS 16%',
  '0':    'ITBIS 0%',
  'exento': 'Exento',
};

const TASA_ITBIS_OPCIONES = [
  // 'exento' y '0%' son fiscalmente distintos: exento = fuera del régimen ITBIS;
  // 0% = grava al 0% (mantiene derecho a crédito). Label refleja la diferencia.
  { value: 'exento', label: 'Exento (fuera de ITBIS)' },
  { value: '0',      label: 'ITBIS 0% (gravado al 0%)' },
  { value: '0.16',   label: 'ITBIS 16%' },
  { value: '0.18',   label: 'ITBIS 18%' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

const EMPTY_FORM = {
  nombre: '', descripcion: '', referencia: '',
  precio: '', tasaItbis: 'exento', tipo: 'servicio', unidad: 'Unidad',
};

export default function ProductosPage() {
  const [productos, setProductos]       = useState<Producto[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Producto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  const search = filterValues.q     ?? '';
  const tipoFilter = filterValues.tipo ?? '';

  const cargar = useCallback(async (q: string, tipo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)    params.set('q', q);
      if (tipo) params.set('tipo', tipo);
      const res  = await fetch(`/api/productos?${params}`);
      const data = await res.json();
      setProductos(data.productos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce on filter change
  useEffect(() => {
    const t = setTimeout(() => cargar(search, tipoFilter), 300);
    return () => clearTimeout(t);
  }, [search, tipoFilter, cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowAvanzado(false);
    setShowForm(true);
  }

  function abrirEdicion(p: Producto) {
    setEditTarget(p);
    setForm({
      nombre:      p.nombre,
      descripcion: p.descripcion ?? '',
      referencia:  p.referencia  ?? '',
      precio:      p.precioDOP.toString(),
      tasaItbis:   p.tasaItbis,
      tipo:        p.tipo,
      unidad:      'Unidad',
    });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    const precio = parseFloat(form.precio);
    if (isNaN(precio) || precio < 0) { setOpError('El precio debe ser un número positivo'); return; }

    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/productos/${editTarget.id}` : '/api/productos';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, precio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar(search, tipoFilter);
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
      const res  = await fetch(`/api/productos/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search, tipoFilter);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<Producto>[] = useMemo(() => [
    {
      id: 'nombre',
      header: 'Nombre',
      sortable: true,
      render: p => (
        <div>
          <p className="font-medium text-gray-900">{p.nombre}</p>
          {p.descripcion && (
            <p className="text-xs text-gray-400 truncate max-w-[260px]">{p.descripcion}</p>
          )}
        </div>
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: p => <span className="font-mono text-sm text-gray-500">{p.referencia ?? '—'}</span>,
    },
    {
      id: 'tipo',
      header: 'Tipo',
      visibleAt: 'md',
      render: p => (
        <Badge variant={p.tipo === 'bien' ? 'secondary' : 'outline'}>
          {p.tipo === 'bien' ? 'Bien' : 'Servicio'}
        </Badge>
      ),
    },
    {
      id: 'precio',
      header: 'Precio (DOP)',
      align: 'right',
      sortable: true,
      sortAccessor: p => p.precioDOP,
      render: p => (
        <span className="font-medium whitespace-nowrap">
          {p.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      id: 'itbis',
      header: 'ITBIS',
      visibleAt: 'md',
      render: p => <span className="text-sm text-gray-600">{TASA_LABELS[p.tasaItbis] ?? p.tasaItbis}</span>,
    },
  ], []);

  const rowActions = (p: Producto): RowAction[] => [
    { icon: Pencil, title: 'Editar',   onClick: () => abrirEdicion(p) },
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(p); setOpError(null); }, variant: 'danger' },
  ];

  return (
    <section className="p-6 space-y-6">
      <DataTable<Producto>
        data={productos}
        loading={loading}
        columns={columns}
        title="Productos y Servicios"
        description="Catálogo de ítems para tus facturas"
        filters={[
          { type: 'search', id: 'q', placeholder: 'Buscar por nombre o referencia…' },
          {
            type: 'select',
            id: 'tipo',
            label: 'Todos',
            options: [
              { value: 'bien',     label: 'Bienes' },
              { value: 'servicio', label: 'Servicios' },
            ],
            placeholder: 'Todos los tipos',
          },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        emptyState={{
          icon: Package,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin productos o servicios registrados',
          hint: search ? undefined : 'Crea tu catálogo para agilizar la emisión de facturas',
          cta: search ? undefined : (
            <Button className="bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
              <Plus className="h-4 w-4 mr-1" />Nuevo ítem
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
              Nuevo ítem
            </Button>
          </div>
        }
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        endpoint="/api/import/productos"
        title="Importar productos de Alegra"
        helpText="Archivo CSV exportado de Alegra (Productos-servicios). Se omiten duplicados por referencia o nombre."
        columns={[
          { key: 'nombre',      label: 'Nombre' },
          { key: 'referencia',  label: 'Referencia' },
          { key: 'precio',      label: 'Precio (¢)' },
          { key: 'tasaItbis',   label: 'ITBIS' },
          { key: 'tipo',        label: 'Tipo' },
        ]}
        onDone={() => cargar(search, tipoFilter)}
      />

      {/* ── Modal: Crear / Editar ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) { setShowForm(false); setShowAvanzado(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar ítem' : 'Nuevo producto o servicio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}

            {/* Tipo toggle pills */}
            {!editTarget && (
              <div>
                <div className="flex gap-2">
                  {TIPOS_ITEM.map((t) => {
                    const isSelected = form.tipo === t.value;
                    if (t.disabled) {
                      return (
                        <div key={t.value} title="Próximamente"
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium cursor-not-allowed opacity-40 bg-white border-gray-200 text-gray-400 select-none">
                          {t.label}
                        </div>
                      );
                    }
                    return (
                      <button key={t.value} type="button"
                        onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-teal-100 border-teal-300 text-teal-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}>
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
                </p>
              </div>
            )}

            {/* Nombre */}
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
                value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>

            {/* Precio + ITBIS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Precio (DOP) <span className="text-red-500">*</span></Label>
                <Input type="number" min={0} step={0.01} placeholder="0.00"
                  value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Impuesto (ITBIS)</Label>
                <Select value={form.tasaItbis} onValueChange={(v) => setForm((f) => ({ ...f, tasaItbis: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASA_ITBIS_OPCIONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Unidad de medida */}
            <div className="space-y-1.5">
              <Label>Unidad de medida</Label>
              <Select value={form.unidad} onValueChange={(v) => setForm((f) => ({ ...f, unidad: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Formulario avanzado */}
            <div>
              <button type="button"
                onClick={() => setShowAvanzado((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 font-medium">
                {showAvanzado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Mostrar formulario avanzado
              </button>
              {showAvanzado && (
                <div className="mt-3 space-y-3 border border-dashed border-gray-200 rounded-lg p-4">
                  <div className="space-y-1.5">
                    <Label>Referencia / SKU</Label>
                    <Input placeholder="SERV-001" value={form.referencia}
                      onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Input placeholder="Descripción opcional que aparecerá en la factura"
                      value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setShowAvanzado(false); }} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : (editTarget ? 'Guardar cambios' : 'Crear ítem')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar ítem?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Las facturas existentes no se verán afectadas.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Este ítem dejará de aparecer en el selector de nueva factura.</span>
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
