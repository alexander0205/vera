'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Check, ChevronDown, ChevronUp, PackagePlus } from 'lucide-react';
import type { Producto } from '../utils/types';

const TASA_ITBIS_MODAL = [
  { value: 'exento', label: 'Ninguno (0%)' },
  { value: '0.18',   label: 'ITBIS - (18.00%)' },
  { value: '0.16',   label: 'ITBIS 16% - (16.00%)' },
  { value: '0',      label: 'ITBIS 0% - (0.00%)' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

export function ModalNuevoProducto({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (p: Producto) => void;
}) {
  const [form, setForm]                 = useState({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      // Si es un bien y se indicó cantidad inicial, activar control de inventario
      // y sembrar el stock. Sin esto el producto no genera movimientos de venta
      // ni aparece en el historial del detalle de producto.
      const cantidadInicial = parseInt(form.cantidadInicial, 10);
      const tieneStockInicial =
        form.tipo === 'bien' && form.cantidadInicial.trim() !== '' && !isNaN(cantidadInicial);

      const payload = {
        nombre:       form.nombre,
        precio:       parseFloat(form.precio) || 0,
        tasaItbis:    form.tasaItbis,
        tipo:         form.tipo === 'bien' ? 'bien' : 'servicio',
        descripcion:  form.descripcion,
        unidadMedida: form.unidad,
        ...(tieneStockInicial && {
          controlaInventario: true,
          stockActual:        Math.max(0, cantidadInicial),
        }),
      };
      const res  = await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.producto);
      setForm({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
      setShowAvanzado(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    onClose();
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 520, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
        <PackagePlus size={20} color="#0d9488" />
        Nuevo producto/servicio
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Tipo selector pill buttons */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          {TIPOS_ITEM.map((t) => {
            const isSelected = form.tipo === t.value;
            if (t.disabled) {
              return (
                <Box
                  key={t.value}
                  title="Próximamente"
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75,
                    px: 2, py: 0.75, borderRadius: '9999px',
                    border: '1px solid #e5e7eb', bgcolor: '#fff',
                    fontSize: '0.875rem', fontWeight: 500,
                    color: '#9ca3af', opacity: 0.4,
                    cursor: 'not-allowed', userSelect: 'none',
                  }}
                >
                  {t.label}
                </Box>
              );
            }
            return (
              <Box
                key={t.value}
                component="button"
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: 2, py: 0.75, borderRadius: '9999px',
                  border: isSelected ? '1px solid #99f6e4' : '1px solid #e5e7eb',
                  bgcolor: isSelected ? '#ccfbf1' : '#fff',
                  color: isSelected ? '#134e4a' : '#4b5563',
                  fontSize: '0.875rem', fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: isSelected ? '#99f6e4' : '#d1d5db',
                    bgcolor: isSelected ? '#ccfbf1' : '#f9fafb',
                  },
                }}
              >
                {isSelected && <Check size={14} />}
                {t.label}
              </Box>
            );
          })}
        </Box>
        <Typography variant="caption" sx={{ color: '#4b5563', display: 'block', mb: 2 }}>
          Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
        </Typography>

        {error && (
          <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, mb: 2 }}>
            <Typography variant="body2" sx={{ color: '#b91c1c' }}>{error}</Typography>
          </Box>
        )}

        {/* Nombre */}
        <TextField
          label={<>Nombre <span style={{ color: '#ef4444' }}>*</span></>}
          size="small"
          fullWidth
          placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        {/* Precio + ITBIS */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField
            label={<>Precio (DOP) <span style={{ color: '#ef4444' }}>*</span></>}
            size="small"
            fullWidth
            type="number"
            placeholder="0.00"
            value={form.precio}
            onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Impuesto (ITBIS)</InputLabel>
            <Select
              value={form.tasaItbis}
              label="Impuesto (ITBIS)"
              onChange={(e) => setForm((f) => ({ ...f, tasaItbis: e.target.value }))}
              sx={{ borderRadius: '8px' }}
            >
              {TASA_ITBIS_MODAL.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Unidad */}
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Unidad de medida</InputLabel>
          <Select
            value={form.unidad}
            label="Unidad de medida"
            onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
            sx={{ borderRadius: '8px' }}
          >
            {UNIDADES.map((u) => (
              <MenuItem key={u} value={u}>{u}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Cantidad inicial — solo para bienes */}
        {form.tipo === 'bien' && (
          <TextField
            label="Cantidad inicial en inventario"
            size="small"
            fullWidth
            type="number"
            placeholder="0"
            value={form.cantidadInicial}
            onChange={(e) => setForm((f) => ({ ...f, cantidadInicial: e.target.value }))}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        )}

        {/* Formulario avanzado toggle */}
        <Box>
          <Box
            component="button"
            type="button"
            onClick={() => setShowAvanzado((v) => !v)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#0f766e', fontSize: '0.875rem', fontWeight: 500, p: 0,
              '&:hover': { color: '#134e4a' },
            }}
          >
            {showAvanzado ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Mostrar formulario avanzado
          </Box>

          {showAvanzado && (
            <Box sx={{ mt: 1.5, border: '1px dashed #e5e7eb', borderRadius: '8px', p: 2 }}>
              <TextField
                label="Descripción"
                size="small"
                fullWidth
                placeholder="Descripción opcional que aparecerá en la factura"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={handleClose}
          disabled={saving}
          sx={{ textTransform: 'none', color: '#4b5563', borderColor: '#e5e7eb' }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          disableElevation
          startIcon={saving ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : undefined}
          sx={{ textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          {saving ? 'Guardando…' : 'Crear ítem'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
