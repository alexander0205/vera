/**
 * Módulos del producto — gate central de acceso (SERVER).
 *
 * Un "módulo" es una unidad comercializable de la app: hoy `facturacion`
 * (dashboard completo) y `pos` (punto de venta). Cada empresa tiene una lista
 * de módulos activos (teams.modulosHabilitados, derivada del billing;
 * modulosOverride la fuerza desde el panel admin). Cada usuario accede a un
 * módulo solo si su rol tiene el permiso `modulo:<key>`.
 *
 *   acceso efectivo = módulo activo en la empresa ∩ permiso del rol
 *
 * platform admin → siempre todos los módulos de la empresa (espejo de userCan).
 * Catálogo y helpers puros (client-safe) en lib/config/modules.ts.
 * Memoizado por request vía React cache().
 */

import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import type { Permission } from '@/lib/config/roles';
import { sanitizeModules, type ModuleKey } from '@/lib/config/modules';

export { MODULES, MODULE_LABELS, MODULE_HOME, moduleUrl } from '@/lib/config/modules';
export type { ModuleKey } from '@/lib/config/modules';

const MODULE_PERMISSION: Record<ModuleKey, Permission> = {
  facturacion: 'modulo:facturacion',
  pos: 'modulo:pos',
  escolar: 'modulo:escolar',
};

/**
 * Módulos activos de la empresa. `modulosOverride` (admin plataforma) manda
 * sobre `modulosHabilitados` (billing). Team inexistente → [].
 */
export const getTeamModules = cache(async (teamId: number): Promise<ModuleKey[]> => {
  const [row] = await db
    .select({
      habilitados: teams.modulosHabilitados,
      override: teams.modulosOverride,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) return [];
  if (row.override != null) return sanitizeModules(row.override);
  return sanitizeModules(row.habilitados);
});

/** ¿La empresa tiene el módulo activo? */
export async function teamHasModule(teamId: number, mod: ModuleKey): Promise<boolean> {
  return (await getTeamModules(teamId)).includes(mod);
}

/**
 * Módulos a los que ESTE usuario puede entrar en el team:
 * módulos del team ∩ permisos modulo:* de su rol.
 */
export async function getUserModules(
  teamId: number,
  platformRole: string | null | undefined,
  teamRole: string | null | undefined,
): Promise<ModuleKey[]> {
  const teamMods = await getTeamModules(teamId);
  if (platformRole === 'admin') return teamMods;
  const perms = await getEffectivePermissions(teamId, teamRole);
  return teamMods.filter(m => perms.includes(MODULE_PERMISSION[m]));
}

/** ¿El usuario puede entrar a este módulo en este team? */
export async function userHasModule(
  teamId: number,
  platformRole: string | null | undefined,
  teamRole: string | null | undefined,
  mod: ModuleKey,
): Promise<boolean> {
  return (await getUserModules(teamId, platformRole, teamRole)).includes(mod);
}
