import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, sql } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { agentPresence } from '@/lib/db/schema';

const AGENTE_STALE_MIN = 2;

export async function GET() {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const [mine] = await db.select().from(agentPresence).where(eq(agentPresence.userId, user.id)).limit(1);

  const staleSince = new Date(Date.now() - AGENTE_STALE_MIN * 60_000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentPresence)
    .where(and(eq(agentPresence.isAvailable, true), gte(agentPresence.lastSeenAt, staleSince)));

  return NextResponse.json({ available: mine?.isAvailable ?? false, onlineAgents: count });
}

export async function POST(req: NextRequest) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { available } = (await req.json()) as { available: boolean };

  await db
    .insert(agentPresence)
    .values({ userId: user.id, isAvailable: available, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: agentPresence.userId,
      set: { isAvailable: available, lastSeenAt: new Date(), updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
