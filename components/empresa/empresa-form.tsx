'use client';

/**
 * Formulario de configuración de empresa.
 * Reusable: lo usa Lite y (eventualmente) el dashboard Full.
 *
 * Lee/guarda vía /api/equipo/perfil (GET/POST).
 * Recibe los datos iniciales como prop para evitar un fetch extra (los lee
 * el server en la página padre y los pasa renderizados).
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface EmpresaData {
  razonSocial?:      string | null;
  nombreComercial?:  string | null;
  rnc?:              string | null;
  direccion?:        string | null;
  telefono?:         string | null;
  emailFacturacion?: string | null;
  sitioWeb?:         string | null;
}

// Input compartido: mismo look que el `.input` original (borde gris, foco naranja,
// fuente 1rem en móvil para evitar zoom de iOS y 0.875rem en desktop).
const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d1d5db' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#d1d5db' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3658e1', borderWidth: '2px' },
  },
  '& .MuiOutlinedInput-input': { fontSize: { xs: '1rem', md: '0.875rem' } },
} as const;

export function EmpresaForm({ initial }: { initial: EmpresaData }) {
  const [data, setData]     = useState<EmpresaData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  function set<K extends keyof EmpresaData>(k: K, v: EmpresaData[K]) {
    setData(d => ({ ...d, [k]: v }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res  = await fetch('/api/equipo/perfil', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar');
        return;
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      sx={{
        bgcolor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        p: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
      }}
    >
      <Box>
        <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
          Datos de tu empresa
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.25 }}>
          Esta información aparece en cada factura emitida.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Field label="Razón social" required>
          <TextField
            type="text"
            size="small"
            fullWidth
            value={data.razonSocial ?? ''}
            onChange={e => set('razonSocial', e.target.value)}
            placeholder="Mi Empresa SRL"
            sx={inputSx}
          />
        </Field>

        <Field label="Nombre comercial">
          <TextField
            type="text"
            size="small"
            fullWidth
            value={data.nombreComercial ?? ''}
            onChange={e => set('nombreComercial', e.target.value)}
            placeholder="Mi Empresa"
            sx={inputSx}
          />
        </Field>

        <Field label="RNC" required>
          <TextField
            type="text"
            size="small"
            fullWidth
            value={data.rnc ?? ''}
            onChange={e => set('rnc', e.target.value)}
            placeholder="131988032"
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 11 } }}
            sx={inputSx}
          />
        </Field>

        <Field label="Teléfono">
          <TextField
            type="tel"
            size="small"
            fullWidth
            value={data.telefono ?? ''}
            onChange={e => set('telefono', e.target.value)}
            placeholder="809-555-0001"
            sx={inputSx}
          />
        </Field>

        <Field label="Dirección" span2>
          <TextField
            type="text"
            size="small"
            fullWidth
            value={data.direccion ?? ''}
            onChange={e => set('direccion', e.target.value)}
            placeholder="Calle, número, sector, ciudad"
            sx={inputSx}
          />
        </Field>

        <Field label="Email de facturación">
          <TextField
            type="email"
            size="small"
            fullWidth
            value={data.emailFacturacion ?? ''}
            onChange={e => set('emailFacturacion', e.target.value)}
            placeholder="facturas@miempresa.com"
            sx={inputSx}
          />
        </Field>

        <Field label="Sitio web">
          <TextField
            type="url"
            size="small"
            fullWidth
            value={data.sitioWeb ?? ''}
            onChange={e => set('sitioWeb', e.target.value)}
            placeholder="https://miempresa.com"
            sx={inputSx}
          />
        </Field>
      </Box>

      {error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            p: 1.5,
            bgcolor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#991b1b',
          }}
        >
          <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <Box component="span">{error}</Box>
        </Box>
      )}
      {saved && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            p: 1.5,
            bgcolor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#166534',
          }}
        >
          <CheckCircle2 size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <Box component="span">Cambios guardados.</Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1, borderTop: '1px solid #f3f4f6' }}>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          variant="contained"
          disableElevation
          startIcon={saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : undefined}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            px: 3,
            py: { xs: 1.5, sm: 1.25 },
            bgcolor: '#3658e1',
            color: '#fff',
            fontWeight: 500,
            borderRadius: '8px',
            textTransform: 'none',
            '&:hover': { bgcolor: '#2a45c4' },
            '&.Mui-disabled': { opacity: 0.5, color: '#fff', bgcolor: '#3658e1' },
          }}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </Box>
    </Box>
  );
}

function Field({ label, required, children, span2 = false }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <Box sx={span2 ? { gridColumn: { md: '1 / -1' } } : undefined}>
      <Typography
        component="label"
        sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.5 }}
      >
        {label}{required && <Box component="span" sx={{ color: '#ef4444', ml: 0.25 }}>*</Box>}
      </Typography>
      {children}
    </Box>
  );
}
