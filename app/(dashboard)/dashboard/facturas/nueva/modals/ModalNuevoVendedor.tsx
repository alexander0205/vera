'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

export function ModalNuevoVendedor({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', identificacion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         form.nombre.trim(),
          identificacion: form.identificacion.trim() || undefined,
          observacion:    form.observacion.trim()    || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.vendedor);
      setForm({ nombre: '', identificacion: '', observacion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
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
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>
        Nuevo vendedor
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {error && (
          <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, mb: 2 }}>
            <Typography variant="body2" sx={{ color: '#b91c1c' }}>{error}</Typography>
          </Box>
        )}

        <TextField
          label="Nombre"
          required
          size="small"
          fullWidth
          placeholder="Nombre del vendedor"
          value={form.nombre}
          onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
          sx={{ mb: 2, mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        <TextField
          label="Identificación"
          size="small"
          fullWidth
          placeholder="Cédula u otro identificador"
          value={form.identificacion}
          onChange={(e) => setForm(f => ({ ...f, identificacion: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        <TextField
          label="Observación"
          size="small"
          fullWidth
          placeholder="Notas adicionales"
          value={form.observacion}
          onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
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
          {saving ? 'Guardando…' : 'Crear vendedor'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
