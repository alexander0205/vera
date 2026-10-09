/**
 * POST /api/contabilidad/cuentas/restaurar-base
 *
 * Inserta las cuentas del catálogo base que le falten al team.
 *
 * Existe porque la siembra automática se planta en cuanto el team tiene una sola
 * cuenta, así que un catálogo creado con una versión anterior nunca vería las
 * cuentas nuevas. Pasó al llegar el Paso 3, que necesita `1106 Cobros por
 * liquidar`, `4104 Ingresos por servicios` y `6102 Comisiones por cobro
 * electrónico`.
 *
 * Es explícita a propósito: si alguien borró una cuenta base porque no la usa,
 * no se la devolvemos a sus espaldas en cada render.
 */

import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { sembrarCuentasBaseFaltantes } from '@/lib/contabilidad/catalogo-base';

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'contabilidad:configurar')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const insertadas = await sembrarCuentasBaseFaltantes(teamId, user.id);
  return NextResponse.json({ insertadas });
}
