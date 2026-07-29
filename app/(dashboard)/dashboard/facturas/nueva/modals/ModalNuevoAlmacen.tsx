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
import CircularProgress from '@mui/material/CircularProgress';

export function ModalNuevoAlmacen({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', direccion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/almacenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre.trim(), direccion: form.direccion.trim() || undefined, observacion: form.observacion.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.almacen);
      setForm({ nombre: '', direccion: '', observacion: '' });
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
        Nuevo almacén
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
              placeholder="Ej. Almacén Principal"
              value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Dirección</Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Dirección del almacén"
              value={form.direccion}
              onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Observación</Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Notas adicionales"
              value={form.observacion}
              onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
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
            bgcolor: '#0d9488',
            '&:hover': { bgcolor: '#0f766e' },
            '&.Mui-disabled': { bgcolor: '#0d948880' },
          }}
        >
          {saving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={16} sx={{ color: 'inherit' }} />
              Guardando…
            </Box>
          ) : 'Crear almacén'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
