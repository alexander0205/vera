/**
 * GET /api/contabilidad/libro-diario/[id] — los apuntes de un asiento.
 *
 * Aparte del listado porque el libro diario carga decenas de asientos y traerse
 * todas sus líneas de golpe sería mucha data para algo que el usuario abre de
 * uno en uno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getLineasAsiento } from '@/lib/contabilidad/libro-diario';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'contabilidad:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido.' }, { status: 400 });
  }

  // getLineasAsiento ya filtra por team, así que un id ajeno devuelve vacío en
  // vez de filtrar datos de otra empresa.
  const lineas = await getLineasAsiento(teamId, id);
  return NextResponse.json({ lineas });
}
