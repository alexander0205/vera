/**
 * GET /api/cuentas-por-cobrar
 *   ?clientId=123        — filtrar por cliente
 *   &soloVencidas=true   — solo facturas vencidas
 *
 * Lista facturas crédito con saldo pendiente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getCuentasPorCobrar } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'facturas:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientIdStr    = url.searchParams.get('clientId');
  const soloVencidas   = url.searchParams.get('soloVencidas') === 'true';

  const clientId = clientIdStr ? parseInt(clientIdStr) : undefined;

  const data = await getCuentasPorCobrar(teamId, {
    clientId: clientId && !isNaN(clientId) ? clientId : undefined,
    soloVencidas,
  });

  return NextResponse.json(data);
}
