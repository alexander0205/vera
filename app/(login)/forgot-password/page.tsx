'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb', p: 2 }}>
      <Box sx={{ bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '100%', maxWidth: 380, p: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Box sx={{ height: 40, width: 40, bgcolor: '#0f766e', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1.125rem', lineHeight: 1 }}>e</Typography>
          </Box>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', textAlign: 'center', mb: 1 }}>¿Olvidaste tu contraseña?</Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', textAlign: 'center', mb: 3 }}>
          Ingresa tu email y te enviaremos un enlace para restablecerla.
        </Typography>

        {sent ? (
          <Box sx={{ textAlign: 'center' }}>
            <Alert severity="success" sx={{ borderRadius: '8px', mb: 2, fontSize: '0.875rem' }}>
              Si existe una cuenta con ese email, recibirás un enlace en breve.
            </Alert>
            <Link href="/sign-in" style={{ textDecoration: 'none' }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#0d9488', '&:hover': { textDecoration: 'underline' } }}>
                Volver al inicio de sesión
              </Typography>
            </Link>
          </Box>
        ) : (
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              required
              size="small"
              fullWidth
              placeholder="tu@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
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
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>
            <Typography sx={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
              <Link href="/sign-in" style={{ textDecoration: 'none', color: '#0d9488' }}>Volver al inicio de sesión</Link>
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
