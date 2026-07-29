'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#0d9488', borderWidth: '2px' },
  },
} as const;

const labelSx = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#374151',
  mb: 0.5,
} as const;

export function ContactoForm() {
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, empresa, email, telefono, mensaje }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error enviando solicitud');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CheckCircle size={48} style={{ color: '#10b981', display: 'block', margin: '0 auto 16px' }} />
        <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', mb: 1 }}>
          Solicitud recibida
        </Typography>
        <Typography sx={{ color: '#4b5563' }}>
          Te contactaremos pronto a <strong>{email}</strong>.
        </Typography>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
          Solicita una integración
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 2 }}>
          Completa el formulario y te contactaremos.
        </Typography>
      </Box>

      {error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            bgcolor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            px: 1.5,
            py: 1,
            fontSize: '0.875rem',
            color: '#b91c1c',
          }}
        >
          <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <Box component="span">{error}</Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <Box>
          <Typography component="label" sx={labelSx}>
            Nombre <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
          </Typography>
          <TextField
            type="text"
            required
            size="small"
            fullWidth
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            sx={inputSx}
          />
        </Box>
        <Box>
          <Typography component="label" sx={labelSx}>
            Empresa <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
          </Typography>
          <TextField
            type="text"
            required
            size="small"
            fullWidth
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            sx={inputSx}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <Box>
          <Typography component="label" sx={labelSx}>
            Email <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
          </Typography>
          <TextField
            type="email"
            required
            size="small"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={inputSx}
          />
        </Box>
        <Box>
          <Typography component="label" sx={labelSx}>Teléfono</Typography>
          <TextField
            type="tel"
            size="small"
            fullWidth
            placeholder="+1 809 000-0000"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            sx={inputSx}
          />
        </Box>
      </Box>

      <Box>
        <Typography component="label" sx={labelSx}>
          ¿Cómo podemos ayudarte? <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
        </Typography>
        <TextField
          required
          multiline
          rows={4}
          size="small"
          fullWidth
          placeholder="Cuéntanos sobre tu negocio y qué tipo de integración necesitas..."
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          sx={{ ...inputSx, '& .MuiOutlinedInput-input': { resize: 'none' } }}
        />
      </Box>

      <Button
        type="submit"
        variant="contained"
        disableElevation
        fullWidth
        disabled={sending}
        startIcon={sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : undefined}
        sx={{
          bgcolor: '#0d9488',
          '&:hover': { bgcolor: '#0f766e' },
          '&.Mui-disabled': { opacity: 0.6, color: '#fff', bgcolor: '#0d9488' },
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.875rem',
          textTransform: 'none',
          borderRadius: '8px',
          py: 1.25,
        }}
      >
        {sending ? 'Enviando...' : 'Enviar solicitud'}
      </Button>

      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
        Te responderemos en menos de 24 horas hábiles.
      </Typography>
    </Box>
  );
}
