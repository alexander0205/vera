'use server';

import { z } from 'zod';
import { and, eq, sql, gt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession, clearSession } from '@/lib/auth/session';
import { seedSystemRoles } from '@/lib/auth/permissions';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { darDeAlta } from '@/lib/auth/alta';
import { logActivity } from '@/lib/db/actividad';
import { mandarVerificacion } from '@/lib/auth/verificacion';

const signInSchema = z.object({
  email: z.string().email().min(3).max(255).trim().toLowerCase(),
  password: z.string().min(8).max(100),
  twoFactorCode: z.string().regex(/^\d{6}$/).optional(),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return { error: 'Demasiados intentos. Intenta en 1 minuto.' };
  }

  const userWithTeam = await db
    .select({
      user: users,
      team: teams
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(users.email, email))
    .limit(1);

  if (userWithTeam.length === 0) {
    return {
      error: 'Correo o contraseña incorrectos. Intenta de nuevo.',
      email,
      password
    };
  }

  const { user: foundUser, team: foundTeam } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: 'Correo o contraseña incorrectos. Intenta de nuevo.',
      email,
      password
    };
  }

  // 2FA gate — si está habilitado, exigir código TOTP válido antes de setear sesión
  if (foundUser.twoFactorEnabled && foundUser.twoFactorSecret) {
    const code = data.twoFactorCode;
    if (!code) {
      return {
        error: '2FA_REQUIRED',
        twoFactorRequired: true,
        email,
        password,
      };
    }
    const OTPAuth = await import('otpauth');
    const totp = new OTPAuth.TOTP({
      issuer: 'Zero',
      label: foundUser.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: foundUser.twoFactorSecret,
    });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return {
        error: 'Código 2FA inválido o expirado.',
        twoFactorRequired: true,
        email,
        password,
      };
    }
  }

  await Promise.all([
    setSession(foundUser),
    logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN)
  ]);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: foundTeam, priceId });
  }

  // Owner (plataforma) → panel de admin
  if (foundUser.platformRole === 'admin') redirect('/admin');

  redirect('/dashboard');
});

const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre completo.').max(100),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  terms: z.string().optional().refine(
    (v) => v === 'on',
    { message: 'Debes aceptar los Términos y Condiciones y el Tratamiento de tus datos personales.' },
  ),
  inviteId: z.string().optional(), // legacy (integer id) — kept for compat
  inviteToken: z.string().optional(), // new secure token
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { name, email, password, inviteId, inviteToken } = data;

  // Rate limit signup by IP — 5/min — defensa contra creación masiva de cuentas
  const reqHeadersSignup = await headers();
  const ipSignup = reqHeadersSignup.get('x-forwarded-for') ?? 'unknown';
  const rlSignup = rateLimit(`signup:${ipSignup}`, 5, 60_000);
  if (!rlSignup.allowed) {
    return { error: 'Demasiados intentos de registro. Intenta en 1 minuto.', name, email, password };
  }

  // El alta es la MISMA que la de Google (lib/auth/alta.ts): crear usuario,
  // resolver invitación o empresa nueva, sembrar roles y apuntar la bitácora.
  // Escrita dos veces, el día que se arregle un fallo en una la otra se queda
  // con él.
  const alta = await darDeAlta({
    name,
    email,
    passwordHash: await hashPassword(password),
    inviteId,
    inviteToken,
  });

  // `name` también, no solo email y contraseña: la pantalla lo repinta con
  // `state.name` y sin devolverlo el campo volvía vacío en cada fallo. Fallar
  // el registro y encima tener que reescribir el nombre es el momento en que
  // la gente se va.
  if (!alta.ok) return { error: alta.error, name, email, password };

  const { usuario: createdUser, equipo: createdTeam } = alta;
  await setSession(createdUser);

  // Quien entra con contraseña todavía no ha demostrado que el correo es suyo,
  // así que se le manda el enlace y el muro lo para hasta que lo abra. Por
  // Google esto no pasa: llega verificado de origen.
  await mandarVerificacion(createdUser);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  // A la sala de espera del correo. De ahí, cuando verifique, sale al
  // onboarding — no a la parrilla de ocho planes a ver si adivina.
  redirect('/verifica-tu-correo');
});

export async function signOut() {
  const user = (await getUser()) as User | null;
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }
  await clearSession();
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La contraseña actual es incorrecta.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La nueva contraseña debe ser distinta de la actual.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La nueva contraseña y su confirmación no coinciden.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)
    ]);

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Contraseña incorrecta. No se eliminó la cuenta.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')` // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    await clearSession();
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Correo electrónico inválido')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

// removeTeamMember (server action legacy) eliminado, igual que inviteTeamMember.
// No lo llamaba ninguna pantalla, pero seguía exportado: un server action
// exportado es un endpoint HTTP con su propio id, exista o no una UI que lo
// use. Y este no comprobaba NADA más allá de haber iniciado sesión — cualquier
// miembro podía sacar a cualquier otro de su empresa, incluido el único
// propietario, saltándose los dos frenos que sí tiene el camino bueno.
//
// Quitar miembros va por DELETE /api/equipo/miembros/[id]: solo el owner saca a
// otros, cada quien puede salirse a sí mismo, y no deja borrar al único owner.
// Los admin de plataforma usan eliminarMiembro en /admin/empresas/[id].
