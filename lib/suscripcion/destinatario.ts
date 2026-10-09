/**
 * A quién se le manda un correo de suscripción.
 *
 * Al dueño de la empresa (`owner`), no a quien haya iniciado el checkout ni al
 * último que entró: los avisos de cobro son del dueño, y quien pagó pudo ser
 * la secretaria desde su cuenta. Si no hay owner —fila vieja— cae al miembro
 * más antiguo, que en la práctica es la misma persona.
 */

import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, teams, users } from '@/lib/db/schema';
import { getPlan } from '@/lib/config/plans';

export interface DestinatarioSuscripcion {
  email: string;
  empresa: string;
  /** Nombre de display del plan, ya resuelto. */
  plan: string;
}

/** Null cuando el equipo no existe o no tiene a nadie con correo. */
export async function destinatarioDeSuscripcion(
  teamId: number,
): Promise<DestinatarioSuscripcion | null> {
  const [team] = await db
    .select({ nombre: teams.razonSocial, alias: teams.name, plan: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const candidatos = await db
    .select({ email: users.email, rol: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt));

  const elegido = candidatos.find(c => c.rol === 'owner') ?? candidatos[0];
  if (!elegido?.email) return null;

  return {
    email:   elegido.email,
    empresa: team.nombre ?? team.alias ?? 'tu empresa',
    plan:    getPlan(team.plan).name,
  };
}

/** Miembros con correo, por si algún aviso debe ir a todo el equipo. */
export async function correosDelEquipo(teamId: number): Promise<string[]> {
  const filas = await db
    .select({ email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId)));
  return filas.map(f => f.email).filter(Boolean);
}
