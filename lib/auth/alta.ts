/**
 * Dar de alta una cuenta, venga por contraseña o por Google.
 *
 * Vive aquí y no en `app/(login)/actions.ts` por una razón concreta: ese
 * archivo lleva `'use server'`, y ahí TODO export tiene que ser una acción de
 * servidor. Un ayudante compartido no cabe.
 *
 * Y tiene que ser compartido: crear el usuario, resolver si entra por
 * invitación o funda empresa propia, sembrar los roles y dejarlo apuntado en
 * la bitácora son cinco pasos que si se escriben dos veces acaban divergiendo
 * —y el día que se arregle un fallo en uno, el otro se queda con él.
 */

import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  users, teams, teamMembers, invitations, ActivityType,
  type NewUser, type NewTeam, type NewTeamMember,
} from '@/lib/db/schema';
import { seedSystemRoles } from '@/lib/auth/permissions';
import { logActivity } from '@/lib/db/actividad';

export type DatosDeAlta = {
  name: string;
  email: string;
  /** Ya cifrada. Quien entra por Google trae una imposible de adivinar. */
  passwordHash: string;
  /** Solo en el alta por Google. */
  googleId?: string;
  inviteId?: string;
  inviteToken?: string;
};

export type ResultadoAlta =
  | { ok: true; usuario: typeof users.$inferSelect; equipo: typeof teams.$inferSelect }
  | { ok: false; error: string };

/**
 * Crea el usuario y lo deja dentro de una empresa.
 *
 * NO abre la sesión ni redirige: eso lo decide quien llama, porque el alta por
 * contraseña puede tener que salir hacia el checkout de Stripe y la de Google
 * no.
 */
export async function darDeAlta(datos: DatosDeAlta): Promise<ResultadoAlta> {
  const email = datos.email.trim().toLowerCase();

  const [yaExiste] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email)).limit(1);

  if (yaExiste) {
    // Mismo mensaje que en el login: decir «ese correo ya está registrado»
    // convierte el formulario en un detector de qué correos tienen cuenta.
    return { ok: false, error: 'No se pudo crear el usuario. Intenta de nuevo.' };
  }

  const nuevo: NewUser = {
    name: datos.name,
    email,
    passwordHash: datos.passwordHash,
    googleId: datos.googleId ?? null,
    platformRole: 'member',          // los admin de plataforma solo salen del seed
    // Quien entra por Google ya demostró ante Google que el correo es suyo.
    emailVerified: !!datos.googleId,
    termsAcceptedAt: new Date(),
  };

  const [usuario] = await db.insert(users).values(nuevo).returning();
  if (!usuario) return { ok: false, error: 'No se pudo crear el usuario. Intenta de nuevo.' };

  let equipo: typeof teams.$inferSelect | undefined;
  let rol: string;

  if (datos.inviteToken || datos.inviteId) {
    const [invitacion] = await db.select().from(invitations)
      .where(and(
        datos.inviteToken
          ? eq(invitations.token, datos.inviteToken)
          : eq(invitations.id, parseInt(datos.inviteId!, 10)),
        eq(invitations.email, email),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
      ))
      .limit(1);

    if (!invitacion) return { ok: false, error: 'La invitación no es válida o ya venció.' };

    rol = invitacion.role;
    await db.update(invitations).set({ status: 'accepted' })
      .where(eq(invitations.id, invitacion.id));
    await logActivity(invitacion.teamId, usuario.id, ActivityType.ACCEPT_INVITATION);

    [equipo] = await db.select().from(teams).where(eq(teams.id, invitacion.teamId)).limit(1);
  } else {
    const nuevaEmpresa: NewTeam = { name: `${email}'s Team` };
    [equipo] = await db.insert(teams).values(nuevaEmpresa).returning();
    if (!equipo) return { ok: false, error: 'No se pudo crear la empresa. Intenta de nuevo.' };

    rol = 'owner';
    await seedSystemRoles(equipo.id);
    await logActivity(equipo.id, usuario.id, ActivityType.CREATE_TEAM);
  }

  if (!equipo) return { ok: false, error: 'No se pudo crear la empresa. Intenta de nuevo.' };

  const miembro: NewTeamMember = { userId: usuario.id, teamId: equipo.id, role: rol };
  await db.insert(teamMembers).values(miembro);
  await logActivity(equipo.id, usuario.id, ActivityType.SIGN_UP);

  return { ok: true, usuario, equipo };
}
