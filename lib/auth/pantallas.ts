/**
 * Pantallas apagadas por rol, por empresa. Ver lib/config/pantallas.ts.
 *
 * El Propietario y el admin de plataforma nunca tienen pantallas apagadas:
 * son quienes encienden y apagan, y quitárselas los dejaría sin salida.
 */

import 'server-only';
import { cache } from 'react';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamRolePantallasOcultas } from '@/lib/db/schema';
import { listTeamRoles } from '@/lib/auth/permissions';
import { normalizeRoleKey } from '@/lib/config/roles';
import { esPantalla } from '@/lib/config/pantallas';

/** Por id de rol, las pantallas que tiene apagadas. */
export const ocultasPorRol = cache(async (teamId: number): Promise<Map<number, string[]>> => {
  const roles = await listTeamRoles(teamId);
  const ids = roles.map(r => r.id);
  const filas = ids.length
    ? await db.select().from(teamRolePantallasOcultas)
        .where(inArray(teamRolePantallasOcultas.teamRoleId, ids))
    : [];
  const mapa = new Map<number, string[]>();
  for (const f of filas) {
    if (!esPantalla(f.pantalla)) continue; // pantalla que ya no existe en el catálogo
    mapa.set(f.teamRoleId, [...(mapa.get(f.teamRoleId) ?? []), f.pantalla]);
  }
  return mapa;
});

/** Las pantallas que este usuario no puede ver en la empresa. */
export async function pantallasOcultasDe(
  teamId: number,
  platformRole: string | null | undefined,
  teamRole: string | null | undefined,
): Promise<string[]> {
  const key = normalizeRoleKey(teamRole);
  if (platformRole === 'admin' || !key || key === 'owner') return [];
  const rol = (await listTeamRoles(teamId)).find(r => r.key === key);
  if (!rol) return [];
  return (await ocultasPorRol(teamId)).get(rol.id) ?? [];
}

/** Muestra u oculta varias pantallas para un rol. Idempotente. */
export async function fijarPantallas(teamRoleId: number, pantallas: string[], visible: boolean) {
  if (pantallas.length === 0) return;
  if (visible) {
    await db.delete(teamRolePantallasOcultas).where(and(
      eq(teamRolePantallasOcultas.teamRoleId, teamRoleId),
      inArray(teamRolePantallasOcultas.pantalla, pantallas),
    ));
  } else {
    await db.insert(teamRolePantallasOcultas)
      .values(pantallas.map(pantalla => ({ teamRoleId, pantalla })))
      .onConflictDoNothing();
  }
}
