import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export type TeamRole = 'owner' | 'admin' | 'contador' | 'vendedor' | 'member';

export const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 100,
  admin: 80,
  contador: 60,
  vendedor: 40,
  member: 20,
};

/** Returns true if the role meets the minimum required level */
export function hasRole(userRole: string, minRole: TeamRole): boolean {
  return (ROLE_HIERARCHY[userRole as TeamRole] ?? 0) >= ROLE_HIERARCHY[minRole];
}

/** Returns the user's role in a team, or null if not a member */
export async function getUserRoleInTeam(userId: number, teamId: number): Promise<TeamRole | null> {
  const result = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  return (result[0]?.role as TeamRole) ?? null;
}

/** Checks that the user has at least the given role in the given team.
 *  Returns the role string if authorized, throws a 403 Response if not. */
export async function requireTeamRole(
  userId: number,
  teamId: number,
  minRole: TeamRole = 'member',
): Promise<TeamRole> {
  const role = await getUserRoleInTeam(userId, teamId);
  if (!role || !hasRole(role, minRole)) {
    throw new Response(JSON.stringify({ error: 'Sin permisos' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return role;
}
