'use server';

/**
 * /invitations/accept?token={inviteId}
 *
 * Landing del cliente al hacer clic en el correo de invitación.
 * - Si el email ya tiene cuenta → solo acepta la invitación y redirige a /lite
 * - Si no → muestra formulario para crear nombre + contraseña
 */

import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import {
  invitations, teams, users, teamMembers, activityLogs, ActivityType,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword, setSession, comparePasswords } from '@/lib/auth/session';
import { Receipt } from 'lucide-react';

// ─── Server Action: crear / vincular cuenta ───────────────────────────────────

async function aceptarInvitacion(formData: FormData) {
  'use server';

  const invId    = parseInt(formData.get('invId') as string);
  const nombre   = (formData.get('nombre') as string).trim();
  const password = (formData.get('password') as string);

  if (!nombre || !password || password.length < 8 || isNaN(invId)) {
    redirect(`/invitations/accept?token=${invId}&error=datos`);
  }

  // Re-verificar invitación
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invId), eq(invitations.status, 'pending')))
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
      role:          'member',
      emailVerified: true, // invitado = email verificado
    }).returning();
    user = created;
  } else {
    // Verificar contraseña antes de vincular
    const match = await comparePasswords(password, user.passwordHash);
    if (!match) {
      redirect(`/invitations/accept?token=${invId}&error=password`);
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
    .where(eq(invitations.id, invId));

  // Iniciar sesión
  await setSession(user);

  redirect('/lite');
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const invId = token ? parseInt(token) : NaN;

  if (isNaN(invId)) {
    return <InvalidInvite msg="Enlace de invitación inválido." />;
  }

  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invId))
    .limit(1);

  if (!inv) {
    return <InvalidInvite msg="Esta invitación no existe." />;
  }
  if (inv.status !== 'pending') {
    return <InvalidInvite msg="Esta invitación ya fue utilizada o expiró." />;
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

        {/* Formulario */}
        <form action={aceptarInvitacion} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <input type="hidden" name="invId" value={invId} />

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
