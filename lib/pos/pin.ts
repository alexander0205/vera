/**
 * Autorización por PIN de supervisor para el POS.
 *
 * Un cajero (rol con pos:quitar-item-pin pero sin pos:anular) puede quitar un
 * ítem de un recibo cobrado solo si un supervisor lo autoriza con su PIN. El
 * PIN vive por miembro de equipo (team_members.pos_pin) y solo vale si el rol
 * de ese miembro tiene pos:anular (admin/owner o rol custom equivalente).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { getEffectivePermissions } from '@/lib/auth/permissions';

export interface PinAuth { userId: number; nombre: string | null; role: string }

/**
 * Valida un PIN de supervisor en el team. Devuelve el miembro con ese PIN que
 * puede autorizar (su rol tiene pos:anular), o null si no hay match válido.
 */
export async function autorizarPorPin(teamId: number, pin: string): Promise<PinAuth | null> {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const rows = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role, nombre: users.name })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.posPin, pin)));

  for (const r of rows) {
    const perms = await getEffectivePermissions(teamId, r.role);
    if (perms.includes('pos:anular')) return { userId: r.userId, nombre: r.nombre, role: r.role };
  }
  return null;
}
