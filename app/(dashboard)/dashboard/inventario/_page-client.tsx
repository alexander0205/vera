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
            <FormControl size="small" fullWidth>
              <Select
                value={ajuste.productoId}
                onChange={(e) => setAjuste(a => ({ ...a, productoId: e.target.value }))}
                displayEmpty
                renderValue={(selected) => selected
                  ? (productos.find(p => String(p.id) === selected)?.nombre ?? selected)
                  : <Box component="span" sx={{ color: '#9ca3af' }}>Selecciona un producto...</Box>}
              >
                {productos.map(p => <MenuItem key={p.id} value={String(p.id)}>{p.nombre}</MenuItem>)}
              </Select>
            </FormControl>
            {productos.length === 0 && (
              <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#9ca3af' }}>No hay productos tipo bien con control de inventario activo.</Typography>
            )}
          </Box>

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
