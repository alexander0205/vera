'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, Upload, PackagePlus,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import { ProductoFormModal } from '@/components/productos/ProductoFormModal';

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
  imagen?:              string | null;
  tieneImagen?:         boolean;
}

const TASA_LABELS: Record<string, string> = {
  '0.18': 'ITBIS 18%',
  '0.16': 'ITBIS 16%',
  '0':    'ITBIS 0%',
  'exento': 'Exento',
};

export default function ProductosPage() {
  const [productos, setProductos]       = useState<Producto[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editProductoId, setEditProductoId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [showImport, setShowImport]     = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

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
    setEditProductoId(null);
    setShowForm(true);
  }

  // Deep-link `?nuevo=1`: abre el modal de creación al entrar (p. ej. desde el
  // form de concepto escolar). Se dispara una sola vez al montar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nuevo') === '1') abrirNuevo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirEdicion(p: Producto) {
    setEditProductoId(p.id);
    setShowForm(true);
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
              Importar CSV
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
        title="Importar productos desde CSV"
        helpText="Archivo CSV de productos y servicios. Se omiten duplicados por referencia o nombre."
        columns={[
          { key: 'nombre',      label: 'Nombre' },
          { key: 'referencia',  label: 'Referencia' },
          { key: 'precio',      label: 'Precio (¢)' },
          { key: 'tasaItbis',   label: 'ITBIS' },
          { key: 'tipo',        label: 'Tipo' },
        ]}
        onDone={() => cargar(search, tipoFilter)}
      />

      {/* Modal compartido Crear / Editar */}
      <ProductoFormModal
        open={showForm}
        productoId={editProductoId}
        onClose={() => setShowForm(false)}
        onSaved={() => cargar(search, tipoFilter)}
      />

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
