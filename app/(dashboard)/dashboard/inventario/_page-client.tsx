'use client';

import { useState, useEffect, useCallback } from 'react';
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
  PackagePlus, ArrowDownLeft, ArrowUpRight, ArrowDownCircle, ArrowUpCircle,
  Wrench, Loader2, Package,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Autocomplete } from '@/app/(dashboard)/dashboard/facturas/nueva/components/Autocomplete';

interface Movimiento {
  id:             number;
  tipo:           string;
  cantidad:       number;
  esEntrada:      boolean;
  stockAntes:     number;
  stockDespues:   number;
  referenciaEncf: string | null;
  motivo:         string | null;
  createdAt:      string;
  productoId:     number;
  productoNombre: string | null;
  usuarioNombre:  string | null;
}

interface ProductoBasico {
  id:     number;
  nombre: string;
}

/** Producto para el buscador tipo tabla (referencia · nombre · descripción). */
interface ProductoBusqueda {
  id:          number;
  nombre:      string;
  descripcion: string | null;
  referencia:  string | null;
}

/** Fila del dropdown de productos: referencia · nombre + descripción.
 *  Mismo layout que el buscador de productos en facturas. */
function renderProductoOption(p: ProductoBusqueda) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-start gap-x-3 gap-y-0.5">
      <span
        className="font-mono text-xs text-gray-500 truncate pt-0.5"
        title={p.referencia ?? undefined}
      >
        {p.referencia || '—'}
      </span>
      <p className="min-w-0 font-medium truncate">{p.nombre}</p>
      {p.descripcion && (
        <p
          className="col-span-2 min-w-0 truncate text-xs text-gray-500"
          title={p.descripcion}
        >
          {p.descripcion}
        </p>
      )}
    </div>
  );
}

const TIPO_LABELS: Record<string, string> = {
  VENTA:          'Venta',
  ENTRADA:        'Entrada',
  AJUSTE_SALIDA:  'Ajuste salida',
  AJUSTE_ENTRADA: 'Ajuste entrada',
  DEVOLUCION:     'Devolución',
  STOCK_INICIAL:  'Stock inicial',
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  VENTA:          <ArrowUpRight  className="h-3.5 w-3.5" />,
  ENTRADA:        <ArrowDownLeft className="h-3.5 w-3.5" />,
  AJUSTE_SALIDA:  <Wrench        className="h-3.5 w-3.5" />,
  AJUSTE_ENTRADA: <Wrench        className="h-3.5 w-3.5" />,
  DEVOLUCION:     <ArrowDownLeft className="h-3.5 w-3.5" />,
  STOCK_INICIAL:  <PackagePlus   className="h-3.5 w-3.5" />,
};

type TipoAjuste = 'ENTRADA' | 'AJUSTE_SALIDA' | 'AJUSTE_ENTRADA' | 'STOCK_INICIAL';

/** Dirección del stock: STOCK_INICIAL/ENTRADA/AJUSTE_ENTRADA suman, AJUSTE_SALIDA resta. */
const TIPO_SUMA: Record<TipoAjuste, boolean> = {
  STOCK_INICIAL:  true,
  ENTRADA:        true,
  AJUSTE_ENTRADA: true,
  AJUSTE_SALIDA:  false,
};

interface AjusteForm {
  productoId: string;
  tipo:       TipoAjuste;
  cantidad:   string;
  motivo:     string;
}

const EMPTY_AJUSTE: AjusteForm = {
  productoId: '',
  tipo:       'ENTRADA',
  cantidad:   '',
  motivo:     '',
};

export function InventarioPageClient() {
  const [movimientos, setMovimientos]     = useState<Movimiento[]>([]);
  const [productos,   setProductos]       = useState<ProductoBasico[]>([]);
  const [loading,     setLoading]         = useState(true);
  const [filterValues, setFilterValues]   = useState<Record<string, string>>({});
  const [showAjuste,  setShowAjuste]      = useState(false);
  const [ajuste,      setAjuste]          = useState<AjusteForm>(EMPTY_AJUSTE);
  const [saving,      setSaving]          = useState(false);
  const [opError,     setOpError]         = useState<string | null>(null);
  const [ajusteOk,    setAjusteOk]        = useState<string | null>(null);
  const [productoNombre, setProductoNombre] = useState('');

  const productoFilter = filterValues.productoId ?? '';
  const tipoFilter     = filterValues.tipo        ?? '';

  const cargar = useCallback(async (productoId: string, tipo: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (productoId) p.set('productoId', productoId);
      if (tipo)       p.set('tipo', tipo);
      const res  = await fetch(`/api/inventario/movimientos?${p}`);
      const data = await res.json();
      setMovimientos(data.movimientos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(productoFilter, tipoFilter); }, [productoFilter, tipoFilter, cargar]);

  useEffect(() => {
    fetch('/api/productos?tipo=bien')
      .then(r => r.json())
      .then(d => setProductos(d.productos?.map((p: { id: number; nombre: string }) => ({ id: p.id, nombre: p.nombre })) ?? []));
  }, []);

  async function handleAjuste() {
    if (!ajuste.productoId) { setOpError('Selecciona un producto'); return; }
    const cant = parseInt(ajuste.cantidad);
    if (!cant || cant <= 0) { setOpError('La cantidad debe ser mayor a 0'); return; }

    setSaving(true); setOpError(null);
    try {
      const res  = await fetch('/api/inventario/ajuste', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productoId: parseInt(ajuste.productoId), tipo: ajuste.tipo, cantidad: cant, motivo: ajuste.motivo || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error registrando ajuste');
      setAjusteOk(`Stock actualizado: ${data.stockActual} unidades`);
      setShowAjuste(false);
      setAjuste(EMPTY_AJUSTE);
      setProductoNombre('');
      cargar(productoFilter, tipoFilter);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  /** Buscador de productos tipo bien para el campo Producto del movimiento. */
  async function buscarProductosBien(q: string): Promise<ProductoBusqueda[]> {
    const res  = await fetch(`/api/productos?tipo=bien&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  const columns: DataTableColumn<Movimiento>[] = [
    {
      id: 'tipo',
      header: 'Tipo',
      render: (m) => (
        <Badge variant={m.esEntrada ? 'secondary' : 'outline'}
          className={m.esEntrada
            ? 'bg-green-50 text-green-700 border-green-200'
            : m.tipo === 'VENTA'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'}>
          <span className="flex items-center gap-1">
            {TIPO_ICONS[m.tipo]}
            {TIPO_LABELS[m.tipo] ?? m.tipo}
          </span>
        </Badge>
      ),
    },
    {
      id: 'producto',
      header: 'Producto',
      render: (m) => <span className="font-medium">{m.productoNombre ?? '—'}</span>,
    },
    {
      id: 'cantidad',
      header: 'Cantidad',
      align: 'right',
      render: (m) => (
        <span className={`font-medium ${m.esEntrada ? 'text-green-700' : 'text-red-700'}`}>
          {m.esEntrada ? '+' : '-'}{m.cantidad}
        </span>
      ),
    },
    {
      id: 'stock',
      header: 'Stock antes → después',
      visibleAt: 'md',
      render: (m) => (
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {m.stockAntes} → <strong className="text-gray-800">{m.stockDespues}</strong>
        </span>
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: (m) => m.referenciaEncf
        ? <span className="font-mono text-xs text-blue-700">{m.referenciaEncf}</span>
        : <span className="text-gray-400 text-xs">{m.motivo ?? '—'}</span>,
    },
    {
      id: 'usuario',
      header: 'Usuario',
      visibleAt: 'lg',
      render: (m) => <span className="text-sm text-gray-500">{m.usuarioNombre ?? '—'}</span>,
    },
    {
      id: 'fecha',
      header: 'Fecha',
      render: (m) => (
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {new Date(m.createdAt).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
  ];

  return (
    <section className="p-6 space-y-6">
      {ajusteOk && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
          {ajusteOk}
          <button className="ml-2 underline text-green-700" onClick={() => setAjusteOk(null)}>OK</button>
        </div>
      )}

      <DataTable<Movimiento>
        data={movimientos}
        loading={loading}
        columns={columns}
        title="Movimientos de inventario"
        description="Entradas, salidas y ajustes de stock"
        filters={[
          {
            type:        'select',
            id:          'productoId',
            label:       'Todos los productos',
            placeholder: 'Todos los productos',
            options:     productos.map(p => ({ value: String(p.id), label: p.nombre })),
          },
          {
            type:        'select',
            id:          'tipo',
            label:       'Todos los tipos',
            placeholder: 'Todos los tipos',
            options: [
              { value: 'VENTA',          label: 'Ventas' },
              { value: 'ENTRADA',        label: 'Entradas' },
              { value: 'AJUSTE_SALIDA',  label: 'Ajuste salida' },
              { value: 'AJUSTE_ENTRADA', label: 'Ajuste entrada' },
              { value: 'DEVOLUCION',     label: 'Devoluciones' },
              { value: 'STOCK_INICIAL',  label: 'Stock inicial' },
            ],
          },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        emptyState={{
          icon:  Package,
          title: 'Sin movimientos de inventario',
          hint:  'Los movimientos aparecen aquí cuando emites facturas o haces ajustes manuales',
        }}
        headerActions={
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => { setShowAjuste(true); setOpError(null); setAjuste(EMPTY_AJUSTE); setProductoNombre(''); }}>
            <PackagePlus className="h-4 w-4 mr-2" />
            Nuevo ajuste
          </Button>
        }
      />

      <Dialog open={showAjuste} onOpenChange={(o) => { if (!o) setShowAjuste(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar movimiento de inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Tipo de movimiento</Label>
                {/* Dirección del stock, visible al elegir el tipo (espejo de caja). */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  TIPO_SUMA[ajuste.tipo] ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                }`}>
                  {TIPO_SUMA[ajuste.tipo]
                    ? <><ArrowDownCircle className="h-3 w-3" /> Suma stock</>
                    : <><ArrowUpCircle className="h-3 w-3" /> Resta stock</>}
                </span>
              </div>
              <Select value={ajuste.tipo} onValueChange={(v) => setAjuste(a => ({ ...a, tipo: v as TipoAjuste }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STOCK_INICIAL">Stock inicial (primer registro)</SelectItem>
                  <SelectItem value="ENTRADA">Entrada (compra / reabastecimiento)</SelectItem>
                  <SelectItem value="AJUSTE_ENTRADA">Ajuste entrada (corrección positiva)</SelectItem>
                  <SelectItem value="AJUSTE_SALIDA">Ajuste salida (merma / pérdida)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Producto</Label>
              {/* Mismo buscador tipo tabla (referencia + nombre + descripción) que en facturas. */}
              <Autocomplete<ProductoBusqueda>
                placeholder="Buscar producto por nombre o código..."
                value={productoNombre}
                onSearch={buscarProductosBien}
                onSelect={(p) => { setAjuste(a => ({ ...a, productoId: String(p.id) })); setProductoNombre(p.nombre); }}
                onClear={() => { setAjuste(a => ({ ...a, productoId: '' })); setProductoNombre(''); }}
                renderOption={renderProductoOption}
                dropdownMinWidth={420}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" min={1} step={1} placeholder="0"
                value={ajuste.cantidad} onChange={(e) => setAjuste(a => ({ ...a, cantidad: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Motivo <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Input placeholder="Ej. Compra a proveedor, conteo físico, merma..."
                value={ajuste.motivo} onChange={(e) => setAjuste(a => ({ ...a, motivo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAjuste(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleAjuste} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Registrar movimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
