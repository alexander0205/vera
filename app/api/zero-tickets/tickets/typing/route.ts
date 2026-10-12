import { NextResponse } from 'next/server';
import { eq, and, desc, ne } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';

const TYPING_TTL_MS = 4000;

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id), ne(tickets.status, 'cerrado')))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (!ticket) return NextResponse.json({ ok: true });

  await db
    .update(tickets)
    .set({ userTypingUntil: new Date(Date.now() + TYPING_TTL_MS) })
    .where(eq(tickets.id, ticket.id));

  return NextResponse.json({ ok: true });
}
