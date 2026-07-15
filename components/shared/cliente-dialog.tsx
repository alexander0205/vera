'use client';

/**
 * ClienteDialog — modal compartido de creación de cliente/contacto.
 *
 * ÚNICA fuente para crear clientes inline: lo usan la pantalla de nueva
 * factura y el POS (mismo modal en ambos módulos). Incluye búsqueda RNC/DGII,
 * tipo de identificación y toggle cliente/proveedor. POST /api/clientes.
 */

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
import { UserPlus, X } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';

/** Shape del cliente devuelto por POST /api/clientes. */
export interface ClienteCreado {
  id:          number;
  razonSocial: string;
  rnc:         string | null;
  email:       string | null;
  telefono:    string | null;
}

const TIPOS_IDENTIFICACION = [
  { value: 'rnc', label: 'RNC' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

export function ClienteDialog({ open, onClose, onCreated, nombreInicial = '' }: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: ClienteCreado) => void;
  /** Pre-carga el nombre (ej. lo tipeado en el buscador del POS). */
  nombreInicial?: string;
}) {
  const [form, setForm]         = useState({ razonSocial: nombreInicial, rnc: '', email: '', telefono: '', tipoId: 'rnc' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tipoContacto, setTipo] = useState<'cliente' | 'proveedor'>('cliente');

  async function handleSave() {
    if (!form.razonSocial.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        razonSocial: form.razonSocial.trim(),
        rnc:      form.rnc.trim()      || null,
        email:    form.email.trim()    || null,
        telefono: form.telefono.trim() || null,
        tipoId:   form.tipoId,
      };
      const res  = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.detalles?.fieldErrors as Record<string, string[]> | undefined;
        if (fieldErrors) {
          const msgs = Object.entries(fieldErrors)
            .filter(([, errs]) => errs?.length)
            .map(([field, errs]) => {
              const label: Record<string, string> = {
                razonSocial: 'Nombre', rnc: 'RNC/Cédula',
                email: 'Correo electrónico', telefono: 'Teléfono', direccion: 'Dirección',
              };
              return `${label[field] ?? field}: ${errs[0]}`;
            });
          if (msgs.length) { setError(msgs.join(' · ')); return; }
        }
        throw new Error(data.error ?? 'Error al guardar');
      }
      onCreated(data.cliente);
      setForm({ razonSocial: '', rnc: '', email: '', telefono: '', tipoId: 'rnc' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 520, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.125rem', fontWeight: 600 }}>
        <UserPlus size={20} color="#0d9488" />
        Nuevo contacto
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Tipo contacto toggle */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 0.5, bgcolor: '#f3f4f6', borderRadius: '12px', mb: 2 }}>
          {(['cliente', 'proveedor'] as const).map((t) => (
            <Box
              key={t}
              component="button"
              type="button"
              onClick={() => setTipo(t)}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                py: 1, borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.15s',
                bgcolor: tipoContacto === t ? '#ccfbf1' : 'transparent',
                color: tipoContacto === t ? '#134e4a' : '#6b7280',
                boxShadow: tipoContacto === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                '&:hover': { color: tipoContacto === t ? '#134e4a' : '#374151' },
              }}
            >
              {tipoContacto === t && (
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: '#0d9488', borderRadius: '50%' }} />
                </Box>
              )}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Box>
          ))}
        </Box>

        {error && (
          <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, mb: 2 }}>
            <Typography variant="body2" sx={{ color: '#b91c1c' }}>{error}</Typography>
          </Box>
        )}

        {/* Tipo de identificación */}
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Tipo de identificación</InputLabel>
          <Select
            value={form.tipoId}
            label="Tipo de identificación"
            onChange={(e) => setForm((f) => ({ ...f, tipoId: e.target.value }))}
            sx={{ borderRadius: '8px' }}
          >
            {TIPOS_IDENTIFICACION.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* RNC Search */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 500, color: '#374151' }}>
            RNC / Cédula
          </Typography>
          <RncSearch
            placeholder="Buscar RNC, Cédula o razón social…"
            value={form.rnc ? `${form.rnc}${form.razonSocial ? ` · ${form.razonSocial}` : ''}` : undefined}
            onSelect={(r) => setForm((f) => ({
              ...f,
              rnc: r.rnc,
              razonSocial: r.nombre,
              tipoId: r.tipo === 'cedula' ? 'cedula' : 'rnc',
            }))}
            onClear={() => setForm((f) => ({ ...f, rnc: '', razonSocial: '' }))}
            showSyncHint
          />
        </Box>

        {/* Razón social */}
        <TextField
          label={<>Nombre o Razón social <span style={{ color: '#ef4444' }}>*</span></>}
          size="small"
          fullWidth
          placeholder="Empresa XYZ SRL"
          value={form.razonSocial}
          onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        {/* Email + Teléfono */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField
            label="Correo electrónico"
            size="small"
            fullWidth
            type="email"
            placeholder="Ejemplo@email.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <TextField
            label="Teléfono"
            size="small"
            fullWidth
            placeholder="___-___-____"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          disabled={saving}
          sx={{ textTransform: 'none', color: '#4b5563', borderColor: '#e5e7eb', minWidth: 0, px: 1.5 }}
        >
          <X size={16} />
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          disableElevation
          startIcon={saving ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : undefined}
          sx={{ textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          {saving ? 'Guardando…' : 'Crear contacto'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
