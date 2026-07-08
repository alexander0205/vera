/**
 * Resolución de permisos efectivos POR EMPRESA.
 *
 * Los roles viven en DB (team_roles + team_role_permissions). Cada team tiene
 * los 4 roles de sistema sembrados (owner/admin/user/lector) + los custom que
 * cree. Owner SIEMPRE tiene todos los permisos (no editable).
 *
 * Estas funciones reemplazan a userCan() estático en los guards (api-guard,
 * page-guard), /api/user, el sidebar y caja. Si un team aún no tiene roles
 * sembrados, se cae al catálogo estático de lib/config/roles.ts (compat).
 *
 * Memoización por request vía React cache().
 */

import { cache } from 'react';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamRoles, teamRolePermissions } from '@/lib/db/schema';
import {
  ROLES, ALL_PERMISSIONS, getRole, normalizeRoleKey,
  type Permission,
} from '@/lib/config/roles';

const OWNER_KEY = 'owner';

export interface TeamRoleWithPerms {
  id: number;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  /** Permisos efectivos. owner → todos. */
  permissions: Permission[];
}

/** Lista los roles del team con sus permisos. Si faltan roles de sistema, los siembra. */
export const listTeamRoles = cache(async (teamId: number): Promise<TeamRoleWithPerms[]> => {
  let roles = await db.select().from(teamRoles).where(eq(teamRoles.teamId, teamId));
  const have = new Set(roles.map(r => r.key));
  const missingSystemRole = ROLES.some(r => !have.has(r.key));
  if (missingSystemRole) {
    await seedSystemRoles(teamId);
    roles = await db.select().from(teamRoles).where(eq(teamRoles.teamId, teamId));
  }

  const ids = roles.map(r => r.id);
  const perms = await db
    .select()
    .from(teamRolePermissions)
    .where(inArray(teamRolePermissions.teamRoleId, ids));

  const byRole = new Map<number, Permission[]>();
  for (const p of perms) {
    const arr = byRole.get(p.teamRoleId) ?? [];
    arr.push(p.permission as Permission);
    byRole.set(p.teamRoleId, arr);
  }

  return roles.map(r => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    icon: r.icon,
    color: r.color,
    isSystem: r.isSystem,
    permissions: r.key === OWNER_KEY ? [...ALL_PERMISSIONS] : (byRole.get(r.id) ?? []),
  }));
});

/** Permisos efectivos de un rol en un team. owner → todos. Fallback estático. */
export const getEffectivePermissions = cache(
  async (teamId: number, roleKey: string | null | undefined): Promise<Permission[]> => {
    const key = normalizeRoleKey(roleKey);
    if (!key) return [];
    if (key === OWNER_KEY) return [...ALL_PERMISSIONS];

    const roles = await listTeamRoles(teamId);
    if (roles.length === 0) {
      // Team sin sembrar — catálogo estático del código.
      return getRole(key)?.permissions ?? [];
    }
    const r = roles.find(x => x.key === key);
    return r ? r.permissions : (getRole(key)?.permissions ?? []);
  },
);

/**
 * ¿El user puede ejecutar esta acción en el team? Versión async con overrides
 * por empresa. platform admin → siempre true (espejo de userCan).
 */
export async function userCanForTeam(
  teamId: number,
  platformRole: string | null | undefined,
  teamRole: string | null | undefined,
  permission: Permission,
): Promise<boolean> {
  if (platformRole === 'admin') return true;
  const perms = await getEffectivePermissions(teamId, teamRole);
  return perms.includes(permission);
}

/**
 * Siembra los 4 roles de sistema + sus permisos default para un team.
 * Idempotente — omite los que ya existen. Llamar al crear un team y desde
 * scripts/seed-team-roles.ts para teams existentes.
 */
export async function seedSystemRoles(teamId: number): Promise<void> {
  const existing = await db
    .select({ key: teamRoles.key })
    .from(teamRoles)
    .where(eq(teamRoles.teamId, teamId));
  const have = new Set(existing.map(e => e.key));

  for (const def of ROLES) {
    if (have.has(def.key)) continue;
    const [row] = await db
      .insert(teamRoles)
      .values({
        teamId,
        key: def.key,
        label: def.label,
        description: def.description,
        icon: def.ui.icon,
        color: def.ui.color,
        isSystem: true,
      })
      .returning({ id: teamRoles.id });

    if (def.permissions.length) {
      await db.insert(teamRolePermissions).values(
        def.permissions.map(p => ({ teamRoleId: row.id, permission: p })),
      );
    }
  }
}
