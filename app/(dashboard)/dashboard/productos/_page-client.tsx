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
  PackagePlus, Camera, X,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import MaestrosProductoSection from './MaestrosProductoSection';
import { VariantesEditor, type VariantesPayload } from '@/components/productos/VariantesEditor';

interface Producto {
  id:                   number;
  nombre:               string;
  descripcion:          string | null;
  referencia:           string | null;
  codigoBarras:         string | null;
  precio:               number;
  precioDOP:            number;
  costo:                number;
  costoDOP:             number;
  tasaItbis:            string;
  tipo:                 string;
  activo:               string;
  unidadMedida:         string;
  stockActual:          number;
  stockMinimo:          number;
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  categoriaId:          number | null;
  imagen?:              string | null;  // no viene en el listado; se carga al editar
  tieneImagen?:         boolean;
}

interface Categoria { id: number; nombre: string; }

const IMG_MAX_BYTES = 800_000; // ~800KB, mismo tope que logo/firma de empresa

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  nombre: '', descripcion: '', referencia: '', codigoBarras: '',
  precio: '', tasaItbis: 'exento', tipo: 'servicio', unidad: 'Unidad',
  costo: '', stockActual: '', stockMinimo: '',
  controlaInventario: false, permiteVentaSinStock: true,
  categoriaId: '', imagen: '',
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
  const [categorias, setCategorias]     = useState<Categoria[]>([]);
  // Variantes — solo al crear un bien (gestionar variantes existentes al editar
  // requiere UI aparte, fuera de este MVP).
  const [variantes, setVariantes]           = useState<VariantesPayload>({ activo: false, variantAtributos: [], variants: [] });
  const [resetVariantes, setResetVariantes] = useState(0);
  const usaVariantes = !editTarget && form.tipo === 'bien' && variantes.activo;

  useEffect(() => {
    fetch('/api/categorias').then((r) => r.json()).then((d) => setCategorias(d.categorias ?? []));
  }, []);

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
    setVariantes({ activo: false, variantAtributos: [], variants: [] });
    setResetVariantes(n => n + 1);
    setShowForm(true);
  }

  async function abrirEdicion(p: Producto) {
    setEditTarget(p);
    setForm({
      nombre:               p.nombre,
      descripcion:          p.descripcion ?? '',
      referencia:           p.referencia  ?? '',
      codigoBarras:         p.codigoBarras ?? '',
      precio:               p.precioDOP.toString(),
      tasaItbis:            p.tasaItbis,
      tipo:                 p.tipo,
      unidad:               p.unidadMedida ?? 'Unidad',
      costo:                p.costoDOP?.toString() ?? '',
      stockActual:          p.stockActual?.toString() ?? '',
      stockMinimo:          p.stockMinimo?.toString() ?? '',
      controlaInventario:   p.controlaInventario   ?? false,
      permiteVentaSinStock: p.permiteVentaSinStock ?? true,
      categoriaId:          p.categoriaId != null ? String(p.categoriaId) : '',
      imagen:               p.imagen ?? '',
    });
    setOpError(null);
    setShowForm(true);

    // La imagen (base64) ya no viene en el listado; cargarla del detalle si existe.
    if (p.tieneImagen && !p.imagen) {
      try {
        const res = await fetch(`/api/productos/${p.id}`);
        if (res.ok) {
          const detalle = await res.json();
          const img = detalle?.producto?.imagen ?? detalle?.imagen;
          if (img) setForm((f) => ({ ...f, imagen: img }));
        }
      } catch { /* imagen opcional; ignorar fallo de carga */ }
    }
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
      const costo      = parseFloat(form.costo) || 0;
      const stockActual = parseInt(form.stockActual) || 0;
      const stockMinimo = parseInt(form.stockMinimo) || 0;
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          precio,
          unidadMedida:         form.unidad,
          costo,
          stockActual,
          stockMinimo,
          controlaInventario:   form.controlaInventario,
          permiteVentaSinStock: form.permiteVentaSinStock,
          categoriaId:          form.categoriaId ? Number(form.categoriaId) : null,
          imagen:               form.imagen || null,
          // Variantes: el backend fuerza controlaInventario y stock = suma.
          ...(usaVariantes && {
            variantAtributos: variantes.variantAtributos,
            variants:         variantes.variants,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      setResetVariantes(n => n + 1);
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
      id: 'stock',
      header: 'Stock',
      visibleAt: 'md',
      render: p => {
        if (p.tipo !== 'bien' || !p.controlaInventario) {
          return <span className="text-xs text-gray-400 italic">No aplica</span>;
        }
        const agotado    = p.stockActual <= 0;
        const bajominimo = !agotado && p.stockActual <= p.stockMinimo;
        return (
          <div className="flex items-center gap-2">
            <span className={`font-medium text-sm ${agotado ? 'text-red-600' : bajominimo ? 'text-amber-600' : 'text-green-700'}`}>
              {p.stockActual}
            </span>
            {agotado && (
              <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">Agotado</Badge>
            )}
            {bajominimo && (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Bajo mínimo</Badge>
            )}
          </div>
        );
      },
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
    { icon: Pencil, title: 'Editar', onClick: () => abrirEdicion(p) },
    ...(p.tipo === 'bien' && p.controlaInventario
      ? [{ icon: PackagePlus, title: 'Ver movimientos', onClick: () => { window.location.href = `/dashboard/inventario?productoId=${p.id}`; } }]
      : []),
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(p); setOpError(null); }, variant: 'danger' as const },
  ];

  return (
    <section className="p-6 space-y-6">
      <DataTable<Producto>
        data={productos}
        loading={loading}
        columns={columns}
        rowHref={p => `/dashboard/productos/${p.id}`}
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
        <DialogContent className="max-w-3xl lg:left-[calc(50%+7rem)]">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar ítem' : 'Nuevo producto o servicio'}</DialogTitle>
          </DialogHeader>
          {opError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
          )}

          <div className="grid grid-cols-1 gap-6 py-2 md:grid-cols-[1fr_260px]">
            {/* ── Columna principal ──────────────────────────────────────── */}
            <div className="space-y-4">
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

              {/* Nombre + Categoría */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre <span className="text-red-500">*</span></Label>
                  <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
                    value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Select value={form.categoriaId || 'ninguna'}
                    onValueChange={(v) => setForm((f) => ({ ...f, categoriaId: v === 'ninguna' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">Sin categoría</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                      ))}
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

              {/* Costo — solo para bienes */}
              {form.tipo === 'bien' && (
                <div className="space-y-1.5">
                  <Label>Costo de compra (DOP)</Label>
                  <Input type="number" min={0} step={0.01} placeholder="0.00"
                    value={form.costo} onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))} />
                  <p className="text-xs text-gray-400">Usado para calcular margen y costo de ventas. No aparece en la factura.</p>
                </div>
              )}

              {/* Variantes — solo al crear un bien */}
              {!editTarget && form.tipo === 'bien' && (
                <VariantesEditor onChange={setVariantes} resetSignal={resetVariantes} />
              )}

              {/* Control de inventario — solo para bienes sin variantes
                  (con variantes el stock se define por variante en el editor). */}
              {form.tipo === 'bien' && !usaVariantes && (
                <div className="space-y-3 border border-dashed border-teal-200 rounded-lg p-4 bg-teal-50/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Controlar inventario</p>
                      <p className="text-xs text-gray-400 mt-0.5">El stock se descuenta automáticamente al guardar o emitir facturas</p>
                    </div>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, controlaInventario: !f.controlaInventario }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.controlaInventario ? 'bg-teal-600' : 'bg-gray-200'}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.controlaInventario ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {form.controlaInventario && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Stock actual</Label>
                          <Input type="number" min={0} step={1} placeholder="0"
                            value={form.stockActual} onChange={(e) => setForm((f) => ({ ...f, stockActual: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Stock mínimo</Label>
                          <Input type="number" min={0} step={1} placeholder="0"
                            value={form.stockMinimo} onChange={(e) => setForm((f) => ({ ...f, stockMinimo: e.target.value }))} />
                          <p className="text-xs text-gray-400">Alerta si el stock baja de este número</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700">Permitir venta sin stock</p>
                          <p className="text-xs text-gray-400 mt-0.5">Si está desactivado, se bloqueará la factura cuando el stock sea 0</p>
                        </div>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, permiteVentaSinStock: !f.permiteVentaSinStock }))}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.permiteVentaSinStock ? 'bg-teal-600' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.permiteVentaSinStock ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

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
                      <Label>Código de barras (POS)</Label>
                      <Input placeholder="Escanea o escribe el EAN/UPC" value={form.codigoBarras}
                        onChange={(e) => setForm((f) => ({ ...f, codigoBarras: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Descripción</Label>
                      <Input placeholder="Descripción opcional que aparecerá en la factura"
                        value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* Atributos (maestros) — solo al editar un producto existente */}
              {editTarget && <MaestrosProductoSection productId={editTarget.id} />}
            </div>

            {/* ── Columna lateral: imagen + preview ──────────────────────── */}
            <div className="space-y-4">
              <ImagenProductoBox
                imagen={form.imagen}
                onChange={(v) => setForm((f) => ({ ...f, imagen: v }))}
              />

              <div className="rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-sm font-medium text-gray-800 truncate">{form.nombre || 'Nombre del producto'}</p>
                <p className="text-sm text-gray-500">
                  {form.precio ? `RD$${Number(form.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : 'RD$0.00'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">Referencia</Label>
                <Input placeholder="SERV-001" value={form.referencia}
                  onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} />
              </div>
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

// ─── Imagen del producto (upload + preview) ──────────────────────────────────

function ImagenProductoBox({ imagen, onChange }: { imagen: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { setError('Imagen demasiado grande (máx 800 KB)'); return; }
    setError(null);
    onChange(await fileToBase64(file));
  }

  return (
    <div className="space-y-1.5">
      <Label>Imagen (opcional)</Label>
      <label className="relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300">
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {imagen ? (
          <>
            <img src={imagen} alt="Producto" className="h-full w-full rounded-lg object-cover" />
            <button type="button" onClick={(e) => { e.preventDefault(); onChange(''); }}
              className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-gray-600 shadow hover:bg-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Camera className="h-8 w-8" />
            <span className="text-xs text-center">Selecciona una imagen<br />Tamaño máximo: 800 KB</span>
          </>
        )}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
