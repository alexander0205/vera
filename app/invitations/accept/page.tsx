/**
 * /invitations/accept?token={inviteId}
 *
 * Landing del cliente al hacer clic en el correo de invitación.
 * - Si el email ya tiene cuenta → solo acepta la invitación y redirige a /lite
 * - Si no → muestra formulario para crear nombre + contraseña
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
import { Receipt } from 'lucide-react';

// ─── Server Action: crear / vincular cuenta ───────────────────────────────────

async function aceptarInvitacion(formData: FormData) {
  'use server';

  const invToken = (formData.get('invToken') as string).trim();
  const nombre   = (formData.get('nombre') as string).trim();
  const password = (formData.get('password') as string);

  if (!nombre || !password || password.length < 8 || !invToken) {
    redirect(`/invitations/accept?token=${invToken}&error=datos`);
  }

  // Rate-limit por IP — 5 intentos/min
  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`invite-accept:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    redirect(`/invitations/accept?token=${invToken}&error=rate_limit`);
  }

  // Re-verificar invitación (pending + no expirada)
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(
      eq(invitations.token, invToken),
      eq(invitations.status, 'pending'),
      gt(invitations.expiresAt, new Date()),
    ))
    .limit(1);

  if (!inv) redirect('/sign-in?error=invitacion_invalida');

  // ¿Ya existe usuario con ese email?
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, inv.email))
    .limit(1);

  let user = existing;

  if (!user) {
    // Crear usuario
    const [created] = await db.insert(users).values({
      name:          nombre,
      email:         inv.email,
      passwordHash:  await hashPassword(password),
      platformRole:  'member',
      emailVerified: true, // invitado = email verificado
    }).returning();
    user = created;
  } else {
    // Verificar contraseña antes de vincular
    const match = await comparePasswords(password, user.passwordHash);
    if (!match) {
      redirect(`/invitations/accept?token=${invToken}&error=password`);
    }
  }

  // Vincular al team si no lo está ya
  const [alreadyMember] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, inv.teamId)))
    .limit(1);

  if (!alreadyMember) {
    await db.insert(teamMembers).values({
      userId: user.id,
      teamId: inv.teamId,
      role:   inv.role,
    });

    await db.insert(activityLogs).values({
      teamId:    inv.teamId,
      userId:    user.id,
      action:    ActivityType.ACCEPT_INVITATION,
      ipAddress: '',
    });
  }

  // Marcar invitación como aceptada
  await db.update(invitations)
    .set({ status: 'accepted' })
    .where(eq(invitations.token, invToken));

  // Iniciar sesión
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

  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (!inv) {
    return <InvalidInvite msg="Esta invitación no existe." />;
  }
  if (inv.status !== 'pending') {
    return <InvalidInvite msg="Esta invitación ya fue utilizada o cancelada." />;
  }
  if (inv.expiresAt < new Date()) {
    return <InvalidInvite msg="Esta invitación expiró. Pide una nueva al administrador." />;
  }

  const [team] = await db
    .select({ name: teams.name, razonSocial: teams.razonSocial })
    .from(teams)
    .where(eq(teams.id, inv.teamId))
    .limit(1);

  const teamName = team?.razonSocial ?? team?.name ?? 'EmiteDO';

  // ¿Tiene cuenta ya?
  const [existing] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, inv.email))
    .limit(1);

  const hasAccount = !!existing;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Receipt className="w-7 h-7 text-teal-600" />
            <span className="text-xl font-bold text-gray-900">EmiteDO</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Te invitaron a <span className="text-teal-600">{teamName}</span>
          </h1>
          <p className="text-gray-500 text-sm">
            {hasAccount
              ? `Ingresa tu contraseña de ${inv.email} para aceptar.`
              : `Crea tu cuenta para ${inv.email} y empieza a facturar.`}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Esta invitación expira el{' '}
            <strong>{inv.expiresAt.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</strong>.
          </p>
        </div>

        {/* Errores */}
        {error === 'datos' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            Completa todos los campos. La contraseña debe tener al menos 8 caracteres.
          </div>
        )}
        {error === 'password' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            Contraseña incorrecta. Inténtalo de nuevo.
          </div>
        )}
        {error === 'rate_limit' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            Demasiados intentos. Espera 1 minuto e inténtalo de nuevo.
          </div>
        )}

        {/* Formulario */}
        <form action={aceptarInvitacion} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <input type="hidden" name="invToken" value={token} />

          {/* Email (solo lectura) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              value={inv.email}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Nombre — solo si es cuenta nueva */}
          {!hasAccount && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tu nombre <span className="text-red-500">*</span>
              </label>
              <input
                name="nombre"
                required
                placeholder="Juan Pérez"
                autoComplete="name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          {hasAccount && (
            <input type="hidden" name="nombre" value={existing!.name ?? inv.email} />
          )}

          {/* Contraseña */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {hasAccount ? 'Contraseña' : 'Crear contraseña'} <span className="text-red-500">*</span>
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder={hasAccount ? 'Tu contraseña actual' : 'Mínimo 8 caracteres'}
              autoComplete={hasAccount ? 'current-password' : 'new-password'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {hasAccount ? 'Aceptar invitación' : 'Crear cuenta y entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          ¿Problemas? Contáctanos en{' '}
          <a href="mailto:soporte@emitedo.com" className="text-teal-600 hover:underline">
            soporte@emitedo.com
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function InvalidInvite({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <Receipt className="w-10 h-10 text-teal-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invitación inválida</h1>
        <p className="text-sm text-gray-500 mb-6">{msg}</p>
        <a
          href="/sign-in"
          className="text-sm text-teal-600 hover:underline"
        >
          Ir al inicio de sesión
        </a>
      </div>
    </div>
  );
}
