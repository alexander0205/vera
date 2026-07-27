'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Producto { id: number; nombre: string; stockActual: number; }
interface Almacen  { id: number; nombre: string; }

interface ItemForm {
  productoId:    number | null;
  cantidad:      string;
  costoUnitario: string;
  almacenId:     number | null;
}

export interface CompraPreFill {
  proveedorRnc?:   string;
  proveedorNombre?: string;
  referenciaEncf?: string;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
  prefill?:  CompraPreFill;
}

const ITEM_VACIO: ItemForm = { productoId: null, cantidad: '1', costoUnitario: '0', almacenId: null };

const labelSx = { display: 'block', mb: 0.5, fontSize: '0.875rem', fontWeight: 500, color: '#374151' };

export default function ModalRegistrarCompra({ open, onClose, onSuccess, prefill }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [saving,    setSaving]    = useState(false);

  const [proveedorRnc,    setProveedorRnc]    = useState('');
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [fecha,           setFecha]           = useState(new Date().toISOString().slice(0, 10));
  const [notas,           setNotas]           = useState('');
  const [itbis,           setItbis]           = useState('0');
  const [almacenId,       setAlmacenId]       = useState<number | null>(null);
  const [items,           setItems]           = useState<ItemForm[]>([{ ...ITEM_VACIO }]);

  // Pre-rellenar desde e-CF recibido
  useEffect(() => {
    if (open && prefill) {
      setProveedorRnc(prefill.proveedorRnc ?? '');
      setProveedorNombre(prefill.proveedorNombre ?? '');
    }
    if (!open) {
      setProveedorRnc(''); setProveedorNombre(''); setFecha(new Date().toISOString().slice(0, 10));
      setNotas(''); setItbis('0'); setAlmacenId(null); setItems([{ ...ITEM_VACIO }]);
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/productos').then(r => r.json()).then(d =>
      setProductos((d.productos ?? []).filter((p: { tipo: string }) => p.tipo === 'bien'))
    ).catch(() => {});
    fetch('/api/almacenes').then(r => r.json()).then(d =>
      setAlmacenes(d.almacenes ?? [])
    ).catch(() => {});
  }, [open]);

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  async function handleSubmit() {
    const validItems = items.filter(i => i.productoId && parseInt(i.cantidad) > 0);
    if (validItems.length === 0) {
      toast.error('Agrega al menos un producto con cantidad válida.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/compras/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedorRnc:    proveedorRnc    || null,
          proveedorNombre: proveedorNombre || null,
          fecha,
          referenciaEncf:  prefill?.referenciaEncf ?? null,
          notas:           notas || null,
          almacenId,
          itbis:           parseFloat(itbis) || 0,
          items: validItems.map(i => ({
            productoId:    i.productoId!,
            cantidad:      parseInt(i.cantidad),
            costoUnitario: parseFloat(i.costoUnitario) || 0,
            almacenId:     i.almacenId,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error al registrar compra'); return; }

      toast.success('Compra registrada. Stock actualizado.');
      onSuccess();
      onClose();
    } catch {
      toast.error('Error de red.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => onClose()}
      slotProps={{ paper: { sx: { width: '100%', maxWidth: 672, maxHeight: '90vh' } } as object }}
    >
      <DialogTitle>Registrar entrada de inventario</DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {/* Proveedor */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <Box>
            <Typography component="label" sx={labelSx}>RNC / Cédula proveedor</Typography>
            <TextField size="small" fullWidth value={proveedorRnc} onChange={e => setProveedorRnc(e.target.value)} placeholder="101234567" />
          </Box>
          <Box>
            <Typography component="label" sx={labelSx}>Nombre proveedor</Typography>
            <TextField size="small" fullWidth value={proveedorNombre} onChange={e => setProveedorNombre(e.target.value)} placeholder="Distribuidora XYZ" />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <Box>
            <Typography component="label" sx={labelSx}>Fecha</Typography>
            <TextField type="date" size="small" fullWidth value={fecha} onChange={e => setFecha(e.target.value)} />
          </Box>
          <Box>
            <Typography component="label" sx={labelSx}>Almacén destino</Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={almacenId?.toString() ?? '__none'}
                onChange={e => setAlmacenId(e.target.value === '__none' ? null : parseInt(e.target.value))}
              >
                <MenuItem value="__none">Sin almacén</MenuItem>
                {almacenes.map(a => (
                  <MenuItem key={a.id} value={a.id.toString()}>{a.nombre}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {prefill?.referenciaEncf && (
          <Box sx={{ borderRadius: '8px', bgcolor: '#f0f9ff', border: '1px solid #bae6fd', px: 1.5, py: 1, fontSize: '0.75rem', color: '#0369a1' }}>
            Vinculado a e-NCF: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{prefill.referenciaEncf}</Box>
          </Box>
        )}

        {/* Ítems */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography component="label" sx={labelSx}>Productos recibidos</Typography>
          {items.map((item, idx) => (
            <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 36px', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={item.productoId?.toString() ?? '__none'}
                  onChange={e => setItem(idx, { productoId: e.target.value === '__none' ? null : parseInt(e.target.value) })}
                >
                  <MenuItem value="__none">— Producto —</MenuItem>
                  {productos.map(p => (
                    <MenuItem key={p.id} value={p.id.toString()}>{p.nombre}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="number" size="small" placeholder="Cant."
                value={item.cantidad}
                onChange={e => setItem(idx, { cantidad: e.target.value })}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                type="number" size="small" placeholder="Costo"
                value={item.costoUnitario}
                onChange={e => setItem(idx, { costoUnitario: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              />
              <IconButton
                onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
                sx={{ color: '#9ca3af', '&:hover': { color: '#ef4444' } }}
              >
                <Trash2 style={{ width: 16, height: 16 }} />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 36px', gap: 1, px: 0.5, fontSize: '0.75rem', color: '#9ca3af' }}>
            <Box component="span">Producto</Box><Box component="span">Cantidad</Box><Box component="span">Costo unit. DOP</Box>
          </Box>
          <Button
            variant="outlined" size="small" fullWidth
            onClick={() => setItems(prev => [...prev, { ...ITEM_VACIO }])}
            startIcon={<Plus style={{ width: 14, height: 14 }} />}
            sx={{ mt: 0.5, borderColor: '#d1d5db', color: '#374151' }}
          >
            Agregar producto
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <Box>
            <Typography component="label" sx={labelSx}>ITBIS de la compra (DOP)</Typography>
            <TextField
              type="number" size="small" fullWidth value={itbis}
              onChange={e => setItbis(e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              helperText="Se suma al total. En régimen gravado se registra como crédito fiscal."
            />
          </Box>
        </Box>

        <Box>
          <Typography component="label" sx={labelSx}>Notas internas</Typography>
          <TextField
            multiline rows={2} size="small" fullWidth
            value={notas} onChange={e => setNotas(e.target.value)}
            placeholder="Número de orden, observaciones…"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving} sx={{ borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
        <Button
          variant="contained" onClick={handleSubmit} disabled={saving}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
        >
          Registrar compra
        </Button>
      </DialogActions>
    </Dialog>
  );
}
