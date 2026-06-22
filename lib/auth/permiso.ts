import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { userCan, type Permission } from '@/lib/config/roles';

export interface PermisoContext {
  userId: number;
  teamId: number;
  platformRole: string | null;
  role: string | null;
}

/**
 * Resuelve el contexto de permisos del request: usuario autenticado, team
 * activo, platformRole y rol del team_member. Devuelve null si no hay sesión
 * o team (el caller responde 401/403).
 */
export async function getPermisoContext(): Promise<PermisoContext | null> {
  const user = await getUser();
  if (!user) return null;
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;

  const [[u], [m]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
  ]);

  return {
    userId: user.id,
    teamId,
    platformRole: u?.platformRole ?? null,
    role: m?.role ?? null,
  };
}

/** ¿El contexto tiene el permiso? */
export function ctxCan(ctx: PermisoContext, permission: Permission): boolean {
  return userCan(ctx.platformRole, ctx.role, permission);
}
