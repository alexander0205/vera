import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users, teams, teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import { recepciones } from '@/lib/ecf-api/client';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  // Cargar platformRole del usuario
  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // Cargar rol del miembro en el team activo
  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!userCan(u?.platformRole, m?.role, 'compras:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  // Cargar codigoPublico del contribuyente en ecf-api
  const [team] = await db
    .select({ cp: teams.ecfCodigoPublico })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const cp = team?.cp;
  if (!cp) {
    // Empresa aún no registrada en ecf-api — no es error, muestra mensaje amigable
    return NextResponse.json({ items: [], sinContribuyente: true });
  }

  try {
    const items = await recepciones.listEcf(cp);
    return NextResponse.json({ items });
  } catch (e) {
    console.error('[api/compras] ecf-api error:', e);
    return NextResponse.json(
      { error: 'No se pudieron cargar las compras', detail: String(e) },
      { status: 502 },
    );
  }
}
