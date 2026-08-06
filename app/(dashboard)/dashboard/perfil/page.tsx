'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Shield, CreditCard, Pencil, Check, X, Loader2 } from 'lucide-react';
import { BILLING_ENABLED } from '@/lib/config/billing';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

const PLAN_BADGE: Record<string, { label: string; bgcolor: string; color: string }> = {
  starter:  { label: 'Starter',  bgcolor: '#eff6ff', color: '#1d4ed8' },
  business: { label: 'Business', bgcolor: '#eef2fe', color: '#3658e1' },
  pro:      { label: 'Pro',      bgcolor: '#faf5ff', color: '#7c3aed' },
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function PerfilPage() {
  const [user, setUser] = useState<{ name: string | null; email: string; twoFactorEnabled: boolean } | null>(null);
  const [team, setTeam] = useState<{ planName: string | null; subscriptionStatus: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/empresa/list').then(r => r.json()),
    ]).then(([userData, empresaData]) => {
      setUser(userData);
      setNameInput(userData?.name ?? '');
      const active = empresaData?.teams?.find((t: any) => t.id === empresaData.activeTeamId) ?? empresaData?.teams?.[0];
      if (active) setTeam({ planName: active.planName, subscriptionStatus: active.subscriptionStatus ?? null });
    });
  }, []);

  async function saveName() {
    if (!nameInput.trim()) return;
    setLoading(true); setError(''); setSuccess('');
    const res = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Error al guardar'); setLoading(false); return; }
    setUser(u => u ? { ...u, name: nameInput.trim() } : u);
    setEditing(false);
    setSuccess('Nombre actualizado');
    setLoading(false);
    setTimeout(() => setSuccess(''), 3000);
  }

  function cancelEdit() {
    setNameInput(user?.name ?? '');
    setEditing(false);
    setError('');
  }

  const planKey = (team?.planName ?? '').toLowerCase();
  const planBadge = PLAN_BADGE[planKey];
  const isTrialing = team?.subscriptionStatus === 'trialing';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 600 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Mi perfil</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Gestiona tu información personal</Typography>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Avatar + nombre */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '16px', mb: 2 }}>
        <CardContent sx={{ p: '24px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
            {/* Avatar */}
            <Box sx={{ width: 64, height: 64, borderRadius: '16px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                {user ? getInitials(user.name, user.email) : '…'}
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Nombre */}
              <Box sx={{ mb: 0.5 }}>
                {editing ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MuiTextField
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit(); }}
                      autoFocus size="small"
                      sx={{ width: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontWeight: 600 } }}
                    />
                    <IconButton size="small" onClick={saveName} disabled={loading}
                      sx={{ bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, '&:disabled': { opacity: 0.5 } }}>
                      {loading ? <CircularProgress size={14} color="inherit" /> : <Check style={{ width: 14, height: 14 }} />}
                    </IconButton>
                    <IconButton size="small" onClick={cancelEdit} sx={{ border: '1px solid #e5e7eb', color: 'text.secondary' }}>
                      <X style={{ width: 14, height: 14 }} />
                    </IconButton>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {user?.name ?? 'Sin nombre'}
                    </Typography>
                    <IconButton size="small" onClick={() => setEditing(true)} sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: '#eef2fe' } }}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </IconButton>
                  </Box>
                )}
                {error && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{error}</Typography>}
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{user?.email}</Typography>

              {planBadge && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={planBadge.label} size="small"
                    sx={{ bgcolor: planBadge.bgcolor, color: planBadge.color, height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 1 } }} />
                  {isTrialing && (
                    <Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 600 }}>· Prueba gratis</Typography>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Info rows */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>
        {[
          {
            icon: Mail, label: 'Email', value: user?.email ?? '—', action: null, actionLabel: 'Solo lectura' as string | null,
          },
          {
            icon: Shield, label: 'Seguridad',
            value: `2FA ${user?.twoFactorEnabled ? '· Activo' : '· No configurado'}`,
            action: '/dashboard/security', actionLabel: 'Gestionar',
          },
          // Plan actual solo con billing activo (lib/config/billing).
          ...(BILLING_ENABLED ? [{
            icon: CreditCard, label: 'Plan actual',
            value: `${team?.planName ?? 'Sin plan'}${isTrialing ? ' · Prueba gratis' : ''}`,
            action: '/dashboard/suscripcion', actionLabel: 'Ver plan',
          }] : []),
        ].map((row, i) => (
          <Box key={row.label}>
            {i > 0 && <Divider />}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 2 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: 'grey.50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <row.icon style={{ width: 16, height: 16, color: '#6b7280' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.disabled', display: 'block' }}>
                  {row.label}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', mt: 0.25 }}>{row.value}</Typography>
              </Box>
              {row.action ? (
                <Link href={row.action} style={{ textDecoration: 'none' }}>
                  <MuiButton variant="outlined" size="small"
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: 'primary.main', color: 'primary.main' }}>
                    {row.actionLabel}
                  </MuiButton>
                </Link>
              ) : (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>{row.actionLabel}</Typography>
              )}
            </Box>
          </Box>
        ))}
      </Card>
    </Box>
  );
}
