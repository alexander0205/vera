/**
 * /invitations/accept?token={inviteId}
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import {
  invitations, teams, users, teamMembers, activityLogs, ActivityType,
} from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hashPassword, setSession, comparePasswords } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { Receipt } from 'lucide-react';

// ─── Server Action ─────────────────────────────────────────────────────────────

async function aceptarInvitacion(formData: FormData) {
  'use server';

  const invToken = (formData.get('invToken') as string).trim();
  const nombre   = (formData.get('nombre') as string).trim();
  const password = (formData.get('password') as string);

  if (!nombre || !password || password.length < 8 || !invToken) {
    redirect(`/invitations/accept?token=${invToken}&error=datos`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`invite-accept:${ip}`, 5, 60_000);
  if (!rl.allowed) redirect(`/invitations/accept?token=${invToken}&error=rate_limit`);

  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, invToken), eq(invitations.status, 'pending'), gt(invitations.expiresAt, new Date())))
    .limit(1);

  if (!inv) redirect('/sign-in?error=invitacion_invalida');

  const [existing] = await db.select().from(users).where(eq(users.email, inv.email)).limit(1);
  let user = existing;

  if (!user) {
    const [created] = await db.insert(users).values({
      name: nombre, email: inv.email, passwordHash: await hashPassword(password),
      platformRole: 'member', emailVerified: true,
    }).returning();
    user = created;
  } else {
    const match = await comparePasswords(password, user.passwordHash);
    if (!match) redirect(`/invitations/accept?token=${invToken}&error=password`);
  }

  const [alreadyMember] = await db
    .select().from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, inv.teamId)))
    .limit(1);

  if (!alreadyMember) {
    await db.insert(teamMembers).values({ userId: user.id, teamId: inv.teamId, role: inv.role });
    await db.insert(activityLogs).values({ teamId: inv.teamId, userId: user.id, action: ActivityType.ACCEPT_INVITATION, ipAddress: '' });
  }

  await db.update(invitations).set({ status: 'accepted' }).where(eq(invitations.token, invToken));
  await setSession(user);
  redirect('/dashboard');
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || token.length !== 64) {
    return <InvalidInvite msg="Enlace de invitación inválido." />;
  }

  const [inv] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  if (!inv) return <InvalidInvite msg="Esta invitación no existe." />;
  if (inv.status !== 'pending') return <InvalidInvite msg="Esta invitación ya fue utilizada o cancelada." />;
  if (inv.expiresAt < new Date()) return <InvalidInvite msg="Esta invitación expiró. Pide una nueva al administrador." />;

  const [team] = await db.select({ name: teams.name, razonSocial: teams.razonSocial }).from(teams).where(eq(teams.id, inv.teamId)).limit(1);
  const teamName = team?.razonSocial ?? team?.name ?? 'Zero';

  const [existing] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, inv.email)).limit(1);
  const hasAccount = !!existing;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Receipt size={28} color="#0d9488" />
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Zero</Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
            Te invitaron a <Box component="span" sx={{ color: '#0d9488' }}>{teamName}</Box>
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {hasAccount
              ? `Ingresa tu contraseña de ${inv.email} para aceptar.`
              : `Crea tu cuenta para ${inv.email} y empieza a facturar.`}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 1 }}>
            Esta invitación expira el{' '}
            <strong>{inv.expiresAt.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</strong>.
          </Typography>
        </Box>

        {error === 'datos'      && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>Completa todos los campos. La contraseña debe tener al menos 8 caracteres.</Alert>}
        {error === 'password'   && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>Contraseña incorrecta. Inténtalo de nuevo.</Alert>}
        {error === 'rate_limit' && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>Demasiados intentos. Espera 1 minuto e inténtalo de nuevo.</Alert>}

        <Box
          component="form"
          action={aceptarInvitacion}
          sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <input type="hidden" name="invToken" value={token} />

          <TextField
            label="Email"
            size="small"
            fullWidth
            defaultValue={inv.email}
            disabled
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb' } }}
          />

          {!hasAccount && (
            <TextField
              name="nombre"
              label={<>Tu nombre <Box component="span" sx={{ color: '#ef4444' }}>*</Box></>}
              required
              size="small"
              fullWidth
              placeholder="Juan Pérez"
              autoComplete="name"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          )}

          {hasAccount && <input type="hidden" name="nombre" value={existing!.name ?? inv.email} />}

          <TextField
            name="password"
            type="password"
            label={<>{hasAccount ? 'Contraseña' : 'Crear contraseña'} <Box component="span" sx={{ color: '#ef4444' }}>*</Box></>}
            required
            size="small"
            fullWidth
            slotProps={{ htmlInput: { minLength: 8 } }}
            placeholder={hasAccount ? 'Tu contraseña actual' : 'Mínimo 8 caracteres'}
            autoComplete={hasAccount ? 'current-password' : 'new-password'}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <Button
            type="submit"
            variant="contained"
            disableElevation
            fullWidth
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, py: 1.25 }}
          >
            {hasAccount ? 'Aceptar invitación' : 'Crear cuenta y entrar'}
          </Button>
        </Box>

        <Typography sx={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', mt: 2 }}>
          ¿Problemas? Contáctanos en{' '}
          <Box component="a" href="mailto:soporte@zero.com.do" sx={{ color: '#0d9488', '&:hover': { textDecoration: 'underline' } }}>
            soporte@zero.com.do
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}

function InvalidInvite({ msg }: { msg: string }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Box sx={{ textAlign: 'center', maxWidth: 360 }}>
        <Receipt size={40} color="#0d9488" style={{ margin: '0 auto 16px' }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>Invitación inválida</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 3 }}>{msg}</Typography>
        <Box component="a" href="/sign-in" sx={{ fontSize: '0.875rem', color: '#0d9488', '&:hover': { textDecoration: 'underline' } }}>
          Ir al inicio de sesión
        </Box>
      </Box>
    </Box>
  );
}
