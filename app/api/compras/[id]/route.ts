import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users, teams, teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { recepciones } from '@/lib/ecf-api/client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, u?.platformRole, m?.role, 'compras:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const [team] = await db
    .select({ cp: teams.ecfCodigoPublico })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const cp = team?.cp;
  if (!cp) {
    return NextResponse.json(
      { error: 'Empresa sin contribuyente registrado en ecf-api' },
      { status: 404 },
    );
  }

  try {
    const item = await recepciones.getEcf(cp, id);
    return NextResponse.json(item);
  } catch (e) {
    console.error('[api/compras/[id]] ecf-api error:', e);
    return NextResponse.json(
      { error: 'No se pudo cargar el detalle de la compra', detail: String(e) },
      { status: 502 },
    );
  }
}
