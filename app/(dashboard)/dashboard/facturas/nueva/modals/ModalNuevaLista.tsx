'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';

export function ModalNuevaLista({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (l: { id: number; nombre: string; tipo: string; porcentaje: number }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/listas-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          tipo:        form.tipo,
          porcentaje:  form.tipo === 'porcentaje' ? parseFloat(form.porcentaje) * 100 || 0 : 0,
          descripcion: form.descripcion.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.lista);
      setForm({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { onClose(); setError(null); }}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>
        Nueva lista de precios
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && (
            <Box sx={{
              bgcolor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '0.875rem',
              borderRadius: '8px',
              px: 1.5,
              py: 1,
            }}>
              {error}
            </Box>
          )}

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Nombre <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Ej. Lista mayorista"
              value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Tipo</Typography>
            <Select
              size="small"
              fullWidth
              value={form.tipo}
              onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
              sx={{ borderRadius: '8px' }}
            >
              <MenuItem value="valor">Valor fijo</MenuItem>
              <MenuItem value="porcentaje">Porcentaje de descuento</MenuItem>
            </Select>
          </Box>

          {form.tipo === 'porcentaje' && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Porcentaje (%)</Typography>
              <TextField
                size="small"
                fullWidth
                type="number"
                placeholder="0.00"
                value={form.porcentaje}
                onChange={(e) => setForm(f => ({ ...f, porcentaje: e.target.value }))}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          )}

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Descripción</Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Descripción opcional"
              value={form.descripcion}
              onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          disabled={saving}
          onClick={() => { onClose(); setError(null); }}
          sx={{
            textTransform: 'none',
            color: '#4b5563',
            borderColor: '#e5e7eb',
            '&:hover': { borderColor: '#d1d5db', bgcolor: 'transparent' },
          }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          disableElevation
          disabled={saving}
          onClick={handleSave}
          sx={{
            textTransform: 'none',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
            '&.Mui-disabled': { bgcolor: '#3658e180' },
          }}
        >
          {saving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={16} sx={{ color: 'inherit' }} />
              Guardando…
            </Box>
          ) : 'Crear lista'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
