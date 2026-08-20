'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { Users, UserPlus, CheckCircle, ExternalLink } from 'lucide-react';
import { INVITABLE_ROLES } from '@/lib/config/roles';

export function EquipoCard() {
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState<string>(INVITABLE_ROLES[0]?.key ?? 'member');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleInvite() {
    setError(null); setSuccess(null);
    if (!email.trim()) { setError('Ingresa un email.'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/equipo/invitaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo enviar la invitación.'); return; }
      setSuccess(`Invitación enviada a ${email.trim()}.`);
      setEmail('');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Users size={16} color="#3658e1" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Equipo y permisos</Typography>
      </Box>
      <Box sx={{ px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" sx={{ color: '#4b5563' }}>
          Invita a otros usuarios para que colaboren en este negocio. Recibirán un correo con un enlace para aceptar la invitación.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px auto' }, gap: 1.5, alignItems: 'flex-end' }}>
          <TextField
            label="Correo electrónico"
            type="email"
            size="small"
            fullWidth
            placeholder="colega@empresa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) handleInvite(); }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <FormControl size="small" fullWidth disabled={loading}>
            <InputLabel>Rol</InputLabel>
            <Select value={role} label="Rol" onChange={e => setRole(e.target.value)} sx={{ borderRadius: '8px' }}>
              {INVITABLE_ROLES.map(r => (
                <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            disableElevation
            onClick={handleInvite}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <UserPlus size={16} />}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' }, height: 40, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Enviando…' : 'Invitar'}
          </Button>
        </Box>

        {success && (
          <Alert severity="success" icon={<CheckCircle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.875rem' }}>
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ borderRadius: '8px', fontSize: '0.875rem' }}>{error}</Alert>
        )}

        <Box sx={{ pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Link href="/dashboard/equipo" style={{ textDecoration: 'none' }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: '#3658e1', '&:hover': { color: '#2a45c4', '& *': { textDecoration: 'underline' } } }}>
              <Typography variant="body2" sx={{ color: 'inherit' }}>Ver y gestionar todos los miembros del equipo</Typography>
              <ExternalLink size={14} />
            </Box>
          </Link>
        </Box>
      </Box>
    </Box>
  );
}
