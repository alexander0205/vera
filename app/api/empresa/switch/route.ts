import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { setActiveTeam } from '@/lib/auth/session';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { teamId } = await req.json();
  if (!teamId || typeof teamId !== 'number') {
    return NextResponse.json({ error: 'teamId requerido' }, { status: 400 });
  }

  // Verificar que el usuario pertenece a ese team
  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!membership[0]) {
    return NextResponse.json({ error: 'No tienes acceso a esa empresa' }, { status: 403 });
  }

  await setActiveTeam(teamId);
  return NextResponse.json({ success: true });
}
