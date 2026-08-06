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
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
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

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  };
  await db.insert(activityLogs).values(newActivity);
}

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
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  inviteId: z.string().optional(), // legacy (integer id) — kept for compat
  inviteToken: z.string().optional(), // new secure token
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId, inviteToken } = data;

  // Rate limit signup by IP — 5/min — defensa contra creación masiva de cuentas
  const reqHeadersSignup = await headers();
  const ipSignup = reqHeadersSignup.get('x-forwarded-for') ?? 'unknown';
  const rlSignup = rateLimit(`signup:${ipSignup}`, 5, 60_000);
  if (!rlSignup.allowed) {
    return { error: 'Demasiados intentos de registro. Intenta en 1 minuto.', email, password };
  }

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'No se pudo crear el usuario. Intenta de nuevo.',
      email,
      password
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = {
    email,
    passwordHash,
    platformRole: 'member', // Solo el seed crea platform admins
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: 'No se pudo crear el usuario. Intenta de nuevo.',
      email,
      password
    };
  }

  let teamId: number;
  let userRole: string;
  let createdTeam: typeof teams.$inferSelect | null = null;

  if (inviteToken || inviteId) {
    // Check if there's a valid invitation — prefer token, fall back to legacy id
    // Also enforce expiresAt > now (no aceptar invitaciones expiradas)
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          inviteToken
            ? eq(invitations.token, inviteToken)
            : eq(invitations.id, parseInt(inviteId!)),
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        )
      )
      .limit(1);

    if (invitation) {
      teamId = invitation.teamId;
      userRole = invitation.role;

      await db
        .update(invitations)
        .set({ status: 'accepted' })
        .where(eq(invitations.id, invitation.id));

      await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION);

      [createdTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
    } else {
      return { error: 'La invitación no es válida o ya venció.', email, password };
    }
  } else {
    // Create a new team if there's no invitation
    const newTeam: NewTeam = {
      name: `${email}'s Team`
    };

    [createdTeam] = await db.insert(teams).values(newTeam).returning();

    if (!createdTeam) {
      return {
        error: 'No se pudo crear la empresa. Intenta de nuevo.',
        email,
        password
      };
    }

    teamId = createdTeam.id;
    userRole = 'owner';

    await seedSystemRoles(teamId);
    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM);
  }

  const newTeamMember: NewTeamMember = {
    userId: createdUser.id,
    teamId: teamId,
    role: userRole
  };

  await Promise.all([
    db.insert(teamMembers).values(newTeamMember),
    logActivity(teamId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser)
  ]);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  // Con billing activo se elige plan de prueba; mientras el producto está en
  // desarrollo no hay pricing que mostrar y se entra directo al dashboard.
  redirect(BILLING_ENABLED ? '/pricing?welcome=1' : '/dashboard');
});

export async function signOut() {
  const user = (await getUser()) as User | null;
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }
  (await cookies()).delete('session');
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

    (await cookies()).delete('session');
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

const removeTeamMemberSchema = z.object({
  memberId: z.number()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'El usuario no pertenece a ninguna empresa' };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId)
        )
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { success: 'Team member removed successfully' };
  }
);

// inviteTeamMember (server action legacy) eliminado — el único camino de
// invitación es POST /api/equipo/invitaciones (roles de team_roles + email).
