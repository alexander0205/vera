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
import {
  sanitizeModules,
  withBaseModules,
  withDependencies,
  type ModuleKey,
} from '@/lib/config/modules';
import { modulosDelPlan } from '@/lib/config/plans';
import { MODULOS } from '@/lib/config/suscripcion';

export { MODULES, MODULE_LABELS, MODULE_HOME, moduleUrl } from '@/lib/config/modules';
export type { ModuleKey } from '@/lib/config/modules';

const MODULE_PERMISSION: Record<ModuleKey, Permission> = {
  facturacion: 'modulo:facturacion',
  administracion: 'modulo:administracion',
  pos: 'modulo:pos',
  escolar: 'modulo:escolar',
};

/**
 * Módulos activos de la empresa, por orden de autoridad:
 *
 *   1. modulosOverride   — lo que dijimos nosotros desde /admin
 *   2. plan + adicionales — lo que compró (solo si el billing está encendido)
 *   3. modulosHabilitados — la lista que administramos a mano
 *   4. + módulos base     — siempre, pase lo que pase
 *
 * El paso 2 es lo que le da sentido técnico a las tres líneas comerciales:
 * sin él, "Zero POS + ERP" y "Zero ERP" serían el mismo producto con precios
 * distintos, porque los módulos saldrían igual de una columna que Stripe no
 * mira. `modulosDelPlan` devuelve null con el billing apagado, y ahí el
 * sistema sigue funcionando exactamente como antes de este cambio.
 *
 * El paso 1 se puede desactivar con MODULOS.overrideManualGanaAlPlan. Se deja
 * ganando a propósito: es lo que nos permite regalar un módulo, montar una
 * demo o sostener a un cliente mientras se arregla un pago, sin tocar Stripe.
 *
 * El paso 4 no es cosmético. Una empresa que canceló, o cuya fila quedó con
 * la lista vacía por un webhook a destiempo, tiene que poder entrar igual a
 * ver su propia empresa y sus comprobantes ya emitidos. Lo que le impide
 * crear cosas nuevas es el modo solo-lectura (lib/suscripcion/estado.ts),
 * no este gate. Team inexistente → [].
 */
export const getTeamModules = cache(async (teamId: number): Promise<ModuleKey[]> => {
  const [row] = await db
    .select({
      habilitados: teams.modulosHabilitados,
      override:    teams.modulosOverride,
      planName:    teams.planName,
      adicionales: teams.adicionales,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) return [];

  const guardados = sanitizeModules(row.habilitados);
  const override  = row.override != null ? sanitizeModules(row.override) : null;

  if (override && MODULOS.overrideManualGanaAlPlan) {
    return conBaseYDependencias(override);
  }

  const adicionales = Array.isArray(row.adicionales)
    ? row.adicionales.filter((a): a is string => typeof a === 'string')
    : [];
  const delPlan = modulosDelPlan(row.planName, adicionales);

  // null = billing apagado. Los módulos son nuestros, no de la suscripción.
  return conBaseYDependencias(delPlan ?? override ?? guardados);
});

/**
 * Completa una lista con lo que no puede faltar: las dependencias de cada
 * módulo (escolar cobra a través de facturación) y los módulos base.
 */
function conBaseYDependencias(mods: readonly ModuleKey[]): ModuleKey[] {
  return withBaseModules(withDependencies(mods));
}

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
