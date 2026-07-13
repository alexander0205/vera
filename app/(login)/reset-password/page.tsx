'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';

function ResetForm() {
  const params   = useSearchParams();
  const router   = useRouter();
  const token    = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 8)  { setError('Mínimo 8 caracteres'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const raw  = await res.text();
      const data = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
      if (!res.ok) { setError(data?.error ?? `Error ${res.status}. Intenta solicitar un nuevo enlace.`); setLoading(false); return; }
      router.push('/sign-in?reset=1');
    } catch {
      setError('No se pudo conectar. Verifica tu conexión e intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error" sx={{ borderRadius: '8px', fontSize: '0.875rem' }}>{error}</Alert>}
      <TextField
        label="Nueva contraseña"
        type="password"
        required
        size="small"
        fullWidth
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={e => setPassword(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
      />
      <TextField
        label="Confirmar contraseña"
        type="password"
        required
        size="small"
        fullWidth
        placeholder="Repite la contraseña"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
      />
      <Button
        type="submit"
        variant="contained"
        disableElevation
        fullWidth
        disabled={loading}
        sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, py: 1 }}
      >
        {loading ? 'Guardando…' : 'Restablecer contraseña'}
      </Button>
    </Box>
  );
}

export default function ResetPasswordPage() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb', p: 2 }}>
      <Box sx={{ bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '100%', maxWidth: 380, p: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Box sx={{ height: 40, width: 40, bgcolor: '#0f766e', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1.125rem', lineHeight: 1 }}>e</Typography>
          </Box>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', textAlign: 'center', mb: 3 }}>Nueva contraseña</Typography>
        <Suspense>
          <ResetForm />
        </Suspense>
        <Typography sx={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', mt: 2 }}>
          <Link href="/sign-in" style={{ textDecoration: 'none', color: '#0d9488' }}>Volver al inicio de sesión</Link>
        </Typography>
      </Box>
    </Box>
  );
}
