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
import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { type Permission } from '@/lib/config/roles';
import { userCanForTeam } from '@/lib/auth/permissions';
import { userHasModule, type ModuleKey } from '@/lib/auth/modules';

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

  const teamRole = await getTeamRoleForUser();

  if (!(await userCanForTeam(teamId, user.platformRole, teamRole, permission))) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { ok: true, user, teamId, teamRole };
}

/**
 * Como requirePermission, pero además exige acceso al módulo del producto
 * (empresa con módulo activo ∩ permiso modulo:* del rol). Para endpoints
 * que pertenecen a un módulo comercializable (ej. todo /api/pos → 'pos').
 */
export async function requireModuleAndPermission(
  mod: ModuleKey,
  permission: Permission,
): Promise<AuthOk | AuthErr> {
  const auth = await requirePermission(permission);
  if (!auth.ok) return auth;

  if (!(await userHasModule(auth.teamId, auth.user.platformRole, auth.teamRole, mod))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Módulo no disponible', code: 'MODULO_NO_DISPONIBLE', modulo: mod },
        { status: 403 },
      ),
    };
  }
  return auth;
}
