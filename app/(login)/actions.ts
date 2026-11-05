'use server';

import { z } from 'zod';
import { and, eq, sql, gt, isNull } from 'drizzle-orm';
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
  invitations,
  passwordResetTokens,
  emailVerificationTokens
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
  twoFactorCode: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos.').optional(),
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

  // Ninguna respuesta devuelve la contraseña: lo escrito se queda en el navegador
  // (ver `login.tsx`) y no tiene por qué dar otra vuelta por la red.
  if (userWithTeam.length === 0) {
    return { error: 'Correo o contraseña incorrectos. Intenta de nuevo.' };
  }

  const { user: foundUser, team: foundTeam } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return { error: 'Correo o contraseña incorrectos. Intenta de nuevo.' };
  }

  // 2FA gate — si está habilitado, exigir código TOTP válido antes de setear sesión
  if (foundUser.twoFactorEnabled && foundUser.twoFactorSecret) {
    const code = data.twoFactorCode;
    if (!code) {
      // No es un error: es el segundo paso, y la pantalla pide el código.
      return { twoFactorRequired: true };
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
        error: 'Código inválido o expirado. Escribe el que muestra ahora tu app.',
        twoFactorRequired: true,
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
    return { error: 'Demasiados intentos de registro. Intenta en 1 minuto.', name };
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

  // `name` se devuelve: la pantalla lo repinta con `state.name` y sin él el campo
  // volvía vacío en cada fallo. Fallar el registro y encima tener que reescribir
  // el nombre es el momento en que la gente se va. Correo y contraseña los
  // guarda la propia pantalla.
  if (!alta.ok) return { error: alta.error, name };

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
  // `?alta=correo` es la marca con la que esa pantalla le avisa a Analytics de
  // la cuenta nueva (una vez: luego la quita de la barra).
  redirect('/verifica-tu-correo?alta=correo');
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

    // Una cuenta de administrador de la plataforma no se borra por aquí: se
    // saltaría las reglas del Equipo Zero (el último admin, el dueño) y la
    // auditoría. Primero la quita el dueño en /admin/equipo.
    if (user.platformRole === 'admin') {
      return {
        password,
        error: 'Esta cuenta es de administrador de la plataforma. Pídele al dueño que te quite del Equipo Zero antes de eliminarla.'
      };
    }

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Contraseña incorrecta. No se eliminó la cuenta.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    // Soft delete. `platform_role <> 'admin'`: si entre la comprobación de arriba y esta
    // escritura alguien le dio acceso de administrador, la cuenta NO se borra (el Equipo
    // Zero manda). Y si no se borró nada, tampoco se sigue con lo demás: ni la membresía
    // se quita, ni se cierra la sesión, ni se anota un borrado que no ocurrió.
    const [borrada] = await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')` // Ensure email uniqueness
      })
      .where(and(eq(users.id, user.id), sql`${users.platformRole} <> 'admin'`))
      .returning({ id: users.id });
    if (!borrada) {
      return {
        password,
        error: 'No se pudo eliminar la cuenta. Si eres administrador de la plataforma, pídele al dueño que te quite del Equipo Zero primero.'
      };
    }

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

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

    // Cambiar el correo deshace la verificación. `email_verified` dice «este correo es de
    // esta persona»; si el correo cambia y la marca se queda, esa cuenta pasa a afirmar algo
    // que nadie comprobó. Importa desde que el dueño puede dar acceso de administrador a una
    // cuenta existente por su correo (/admin/equipo): alguien con una cuenta verificada podría
    // ponerle el correo de un futuro integrante y quedarse con ese acceso. Los enlaces de
    // contraseña y de verificación que ya estaban en el aire eran del correo ANTERIOR: se anulan.
    const cambioCorreo = email.trim().toLowerCase() !== user.email.trim().toLowerCase();
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set(cambioCorreo ? { name, email, emailVerified: false, updatedAt: new Date() } : { name, email })
        .where(eq(users.id, user.id));
      if (cambioCorreo) {
        await tx.update(passwordResetTokens).set({ usedAt: new Date() })
          .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
        await tx.update(emailVerificationTokens).set({ usedAt: new Date() })
          .where(and(eq(emailVerificationTokens.userId, user.id), isNull(emailVerificationTokens.usedAt)));
      }
    });
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT);

    // El enlace para verificar el correo NUEVO. Si no sale, la pantalla de verificación ofrece reenviarlo.
    if (cambioCorreo) {
      await mandarVerificacion({ id: user.id, email, name }).catch((e) => {
        console.error('[updateAccount] no se pudo preparar la verificación del correo nuevo:', e instanceof Error ? e.message : e);
      });
    }

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
