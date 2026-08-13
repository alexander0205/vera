'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import {
  PackagePlus, ArrowDownLeft, ArrowUpRight, Wrench, Package,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Autocomplete } from '@/app/(dashboard)/dashboard/facturas/nueva/components/Autocomplete';
import { renderProductoOption } from '@/components/productos/ProductoOption';

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

const TIPO_LABELS: Record<string, string> = {
  VENTA:          'Venta',
  ENTRADA:        'Entrada',
  AJUSTE_SALIDA:  'Ajuste salida',
  AJUSTE_ENTRADA: 'Ajuste entrada',
  DEVOLUCION:     'Devolución',
  STOCK_INICIAL:  'Stock inicial',
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  VENTA:          <ArrowUpRight  style={{ width: 14, height: 14 }} />,
  ENTRADA:        <ArrowDownLeft style={{ width: 14, height: 14 }} />,
  AJUSTE_SALIDA:  <Wrench        style={{ width: 14, height: 14 }} />,
  AJUSTE_ENTRADA: <Wrench        style={{ width: 14, height: 14 }} />,
  DEVOLUCION:     <ArrowDownLeft style={{ width: 14, height: 14 }} />,
  STOCK_INICIAL:  <PackagePlus   style={{ width: 14, height: 14 }} />,
};

type TipoAjuste = 'ENTRADA' | 'AJUSTE_SALIDA' | 'AJUSTE_ENTRADA' | 'STOCK_INICIAL';

interface AjusteForm {
  productoId: string;
  /** Qué talla/color entra o sale. Vacío si el producto no tiene ejes. */
  variantId:  string;
  /** A qué almacén. En el POS viene fijado por la terminal. */
  almacenId:  string;
  tipo:       TipoAjuste;
  cantidad:   string;
  motivo:     string;
}

const EMPTY_AJUSTE: AjusteForm = {
  productoId: '',
  variantId:  '',
  almacenId:  '',
  tipo:       'ENTRADA',
  cantidad:   '',
  motivo:     '',
};

/** Lo mínimo del producto elegido para saber qué más hay que preguntar. */
interface ProductoElegido {
  id: number;
  nombre: string;
  referencia?: string | null;
  descripcion?: string | null;
  variantAtributos?: { nombre: string; valores: string[] }[] | null;
}

interface VarianteBasica {
  id: number;
  nombre: string;
  stockActual?: number;
}

interface AlmacenBasico { id: number; nombre: string }

/**
 * `almacenId` fija la pantalla a UN almacén — lo usa el POS para mostrar solo
 * el inventario de la terminal. Sin él (Facturación) se ven todos.
 */
export function InventarioPageClient({ almacenId }: { almacenId?: number | null } = {}) {
  const [movimientos, setMovimientos]     = useState<Movimiento[]>([]);
  const [productos,   setProductos]       = useState<ProductoBasico[]>([]);
  const [loading,     setLoading]         = useState(true);
  const [filterValues, setFilterValues]   = useState<Record<string, string>>({});
  const [showAjuste,  setShowAjuste]      = useState(false);
  const [ajuste,      setAjuste]          = useState<AjusteForm>(EMPTY_AJUSTE);
  const [saving,      setSaving]          = useState(false);
  const [opError,     setOpError]         = useState<string | null>(null);
  const [ajusteOk,    setAjusteOk]        = useState<string | null>(null);
  const [elegido,     setElegido]         = useState<ProductoElegido | null>(null);
  const [variantes,   setVariantes]       = useState<VarianteBasica[]>([]);
  const [almacenes,   setAlmacenes]       = useState<AlmacenBasico[]>([]);

  // Los ejes del producto (Talla, Color…) dicen si hay que preguntar cuál.
  const tieneVariantes = (elegido?.variantAtributos?.length ?? 0) > 0;

  // Al elegir producto se traen sus variantes. Van por su propia consulta y no
  // con el listado: son de UN producto y el listado trae ciento y pico.
  useEffect(() => {
    const id = ajuste.productoId;
    if (!id) { setVariantes([]); return; }
    let vivo = true;
    fetch(`/api/productos/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d) return;
        const p = d.producto ?? d;
        setElegido({
          id: p.id, nombre: p.nombre, referencia: p.referencia, descripcion: p.descripcion,
          variantAtributos: p.variantAtributos ?? [],
        });
        setVariantes((p.variantes ?? []).map((v: { id: number; nombre: string; stockActual?: number }) => ({
          id: v.id, nombre: v.nombre, stockActual: v.stockActual,
        })));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ajuste.productoId]);

  // Los almacenes solo hacen falta cuando la pantalla NO está fijada a uno.
  useEffect(() => {
    if (almacenId) return;
    fetch('/api/almacenes')
      .then(r => (r.ok ? r.json() : { almacenes: [] }))
      .then(d => setAlmacenes(d.almacenes ?? []))
      .catch(() => {});
  }, [almacenId]);

  const productoFilter = filterValues.productoId ?? '';
  const tipoFilter     = filterValues.tipo        ?? '';

  const cargar = useCallback(async (productoId: string, tipo: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (productoId) p.set('productoId', productoId);
      if (tipo)       p.set('tipo', tipo);
      if (almacenId)  p.set('almacenId', String(almacenId));
      const res  = await fetch(`/api/inventario/movimientos?${p}`);
      const data = await res.json();
      setMovimientos(data.movimientos ?? []);
    } finally {
      setLoading(false);
    }
  }, [almacenId]);

  useEffect(() => { cargar(productoFilter, tipoFilter); }, [productoFilter, tipoFilter, cargar]);

  useEffect(() => {
    fetch('/api/productos?tipo=bien')
      .then(r => r.json())
      .then(d => setProductos(d.productos?.map((p: { id: number; nombre: string }) => ({ id: p.id, nombre: p.nombre })) ?? []));
  }, []);

  /** Busca en el catálogo de bienes. El buscador manda al servidor, no filtra
   *  en memoria: el listado de arriba trae solo la primera página. */
  const buscarProductos = useCallback(async (q: string): Promise<ProductoElegido[]> => {
    const p = new URLSearchParams({ tipo: 'bien', limit: '20' });
    if (q.trim()) p.set('q', q.trim());
    const res = await fetch(`/api/productos?${p}`);
    if (!res.ok) return [];
    const d = await res.json();
    return (d.productos ?? []).map((x: ProductoElegido) => ({
      id: x.id, nombre: x.nombre, referencia: x.referencia, descripcion: x.descripcion,
      variantAtributos: x.variantAtributos ?? [],
    }));
  }, []);

  async function handleAjuste() {
    if (!ajuste.productoId) { setOpError('Selecciona un producto'); return; }
    // Se corta aquí y no en el servidor para no hacer el viaje, pero el
    // servidor lo vuelve a comprobar: esta pantalla no es su único cliente.
    if (tieneVariantes && !ajuste.variantId) {
      setOpError('Este producto tiene variantes: elige a cuál va el movimiento');
      return;
    }
    const cant = parseInt(ajuste.cantidad);
    if (!cant || cant <= 0) { setOpError('La cantidad debe ser mayor a 0'); return; }

    // El almacén de la terminal manda cuando la pantalla está fijada a uno.
    const almacenElegido = almacenId ?? (ajuste.almacenId ? parseInt(ajuste.almacenId) : null);

    setSaving(true); setOpError(null);
    try {
      const res  = await fetch('/api/inventario/ajuste', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productoId: parseInt(ajuste.productoId),
          variantId:  ajuste.variantId ? parseInt(ajuste.variantId) : null,
          almacenId:  almacenElegido,
          tipo: ajuste.tipo,
          cantidad: cant,
          motivo: ajuste.motivo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error registrando ajuste');
      // Se dice de QUÉ es el stock: con tallas, "23 unidades" a secas hacía
      // pensar que era el total del producto cuando es el de la M.
      const deQue = ajuste.variantId
        ? `${elegido?.nombre ?? 'producto'} · ${variantes.find(v => String(v.id) === ajuste.variantId)?.nombre ?? ''}`
        : (elegido?.nombre ?? 'Stock');
      setAjusteOk(`${deQue}: ${data.stockActual} unidades`);
      setShowAjuste(false);
      setAjuste(EMPTY_AJUSTE);
      setElegido(null);
      setVariantes([]);
      cargar(productoFilter, tipoFilter);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Movimiento>[] = [
    {
      id: 'tipo',
      header: 'Tipo',
      render: (m) => {
        const palette = m.esEntrada
          ? { bg: '#f0fdf4', fg: '#15803d', br: '#bbf7d0' }
          : m.tipo === 'VENTA'
            ? { bg: '#fef2f2', fg: '#b91c1c', br: '#fecaca' }
            : { bg: '#fffbeb', fg: '#b45309', br: '#fde68a' };
        return (
          <Chip
            size="small"
            label={
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {TIPO_ICONS[m.tipo]}
                {TIPO_LABELS[m.tipo] ?? m.tipo}
              </Box>
            }
            sx={{ bgcolor: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}
          />
        );
      },
    },
    {
      id: 'producto',
      header: 'Producto',
      render: (m) => <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>{m.productoNombre ?? '—'}</Typography>,
    },
    {
      id: 'cantidad',
      header: 'Cantidad',
      align: 'right',
      render: (m) => (
        <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.875rem', color: m.esEntrada ? '#15803d' : '#b91c1c' }}>
          {m.esEntrada ? '+' : '-'}{m.cantidad}
        </Typography>
      ),
    },
    {
      id: 'stock',
      header: 'Stock antes → después',
      visibleAt: 'md',
      render: (m) => (
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          {m.stockAntes} → <Box component="strong" sx={{ color: '#1f2937' }}>{m.stockDespues}</Box>
        </Typography>
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: (m) => m.referenciaEncf
        ? <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#1d4ed8' }}>{m.referenciaEncf}</Typography>
        : <Typography component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{m.motivo ?? '—'}</Typography>,
    },
    {
      id: 'usuario',
      header: 'Usuario',
      visibleAt: 'lg',
      render: (m) => <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>{m.usuarioNombre ?? '—'}</Typography>,
    },
    {
      id: 'fecha',
      header: 'Fecha',
      render: (m) => (
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          {new Date(m.createdAt).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
        </Typography>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {ajusteOk && (
        <Box sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.875rem', borderRadius: '8px', p: 1.5 }}>
          {ajusteOk}
          <Box
            component="button"
            onClick={() => setAjusteOk(null)}
            sx={{ ml: 1, textDecoration: 'underline', color: '#15803d', background: 'none', border: 'none', p: 0, cursor: 'pointer', font: 'inherit' }}
          >
            OK
          </Box>
        </Box>
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
          <Button
            variant="contained"
            startIcon={<PackagePlus style={{ width: 16, height: 16 }} />}
            onClick={() => { setShowAjuste(true); setOpError(null); setAjuste(EMPTY_AJUSTE); }}
          >
            Nuevo ajuste
          </Button>
        }
      />

      <Dialog
        open={showAjuste}
        onClose={() => setShowAjuste(false)}
        slotProps={{ paper: { sx: { width: '100%', maxWidth: 448 } } as object }}
      >
        <DialogTitle>Registrar movimiento de inventario</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {opError && (
            <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>
          )}

          <Box>
            <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Tipo de movimiento
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={ajuste.tipo}
                onChange={(e) => setAjuste(a => ({ ...a, tipo: e.target.value as TipoAjuste }))}
              >
                <MenuItem value="STOCK_INICIAL">Stock inicial (primer registro)</MenuItem>
                <MenuItem value="ENTRADA">Entrada (compra / reabastecimiento)</MenuItem>
                <MenuItem value="AJUSTE_ENTRADA">Ajuste entrada (corrección positiva)</MenuItem>
                <MenuItem value="AJUSTE_SALIDA">Ajuste salida (merma / pérdida)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Producto
            </Typography>
            {/* El mismo buscador que la línea de factura, con la misma rejilla
                de referencia + nombre + descripción. Era un <select> con solo
                el nombre, y en un catálogo con "Material gastable 01", "02" y
                "03" el nombre no alcanza para saber cuál es cuál. */}
            <Autocomplete<ProductoElegido>
              placeholder="Busca por nombre o referencia…"
              value={elegido?.nombre ?? ''}
              dropdownMinWidth={380}
              onSearch={buscarProductos}
              renderOption={renderProductoOption}
              onSelect={(p) => {
                setElegido(p);
                // La talla anterior no vale para otro producto.
                setAjuste(a => ({ ...a, productoId: String(p.id), variantId: '' }));
              }}
              onClear={() => { setElegido(null); setVariantes([]); setAjuste(a => ({ ...a, productoId: '', variantId: '' })); }}
            />
          </Box>

          {/* Solo si el producto tiene ejes. Preguntarlo siempre sería un campo
              vacío en el 95% de los casos; no preguntarlo cuando los hay es lo
              que descuadraba el total con la suma de las tallas. */}
          {tieneVariantes && (
            <Box>
              <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                {elegido?.variantAtributos?.map(a => a.nombre).join(' / ') || 'Variante'}
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={ajuste.variantId}
                  onChange={(e) => setAjuste(a => ({ ...a, variantId: e.target.value }))}
                  displayEmpty
                  renderValue={(sel) => sel
                    ? (variantes.find(v => String(v.id) === sel)?.nombre ?? sel)
                    : <Box component="span" sx={{ color: '#9ca3af' }}>¿Cuál?</Box>}
                >
                  {variantes.map(v => (
                    <MenuItem key={v.id} value={String(v.id)}>
                      {v.nombre}
                      <Box component="span" sx={{ ml: 1, color: '#9ca3af', fontSize: '0.75rem' }}>
                        stock {v.stockActual ?? 0}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Fijado en el POS (la terminal ya dice cuál), a elegir en
              Facturación. Sin almacén el movimiento no llega a ninguna caja: se
              guardaba con almacén vacío y la propia lista, que filtra por
              almacén, no lo volvía a encontrar. */}
          {!almacenId && (
            <Box>
              <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Almacén <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</Box>
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={ajuste.almacenId}
                  onChange={(e) => setAjuste(a => ({ ...a, almacenId: e.target.value }))}
                  displayEmpty
                  renderValue={(sel) => sel
                    ? (almacenes.find(x => String(x.id) === sel)?.nombre ?? sel)
                    : <Box component="span" sx={{ color: '#9ca3af' }}>Solo el stock general</Box>}
                >
                  <MenuItem value="">Solo el stock general</MenuItem>
                  {almacenes.map(x => <MenuItem key={x.id} value={String(x.id)}>{x.nombre}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          )}

          <Box>
            <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Cantidad
            </Typography>
            <TextField
              type="number"
              size="small"
              fullWidth
              placeholder="0"
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              value={ajuste.cantidad}
              onChange={(e) => setAjuste(a => ({ ...a, cantidad: e.target.value }))}
            />
          </Box>

          <Box>
            <Typography component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Motivo <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</Box>
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Ej. Compra a proveedor, conteo físico, merma..."
              value={ajuste.motivo}
              onChange={(e) => setAjuste(a => ({ ...a, motivo: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setShowAjuste(false)}
            disabled={saving}
            sx={{ borderColor: '#d1d5db', color: '#374151' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleAjuste}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
          >
            {saving ? 'Guardando…' : 'Registrar movimiento'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
