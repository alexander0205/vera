/**
 * Guard de permisos para Route Handlers (App Router).
 *
 * Resuelve sesión + team activo + rol y verifica un permiso granular contra el
 * catálogo de lib/config/roles.ts (misma lógica que usePermissions en el cliente).
 *
 * Uso:
 *   const auth = await requirePermission('caja:operar');
 *   if (!auth.ok) return auth.response;
 *   const { user, teamId } = auth;
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { type Permission } from '@/lib/config/roles';
import { userCanForTeam } from '@/lib/auth/permissions';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export interface AuthOk {
  ok: true;
  user: SessionUser;
  teamId: number;
  teamRole: string | null;
}
export interface AuthErr {
  ok: false;
  response: NextResponse;
}

export async function requirePermission(permission: Permission): Promise<AuthOk | AuthErr> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const teamId = await getTeamIdForUser();
  if (!teamId) {
    return { ok: false, response: NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 }) };
  }

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  const teamRole = m?.role ?? null;

  if (!(await userCanForTeam(teamId, user.platformRole, teamRole, permission))) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { ok: true, user, teamId, teamRole };
}
