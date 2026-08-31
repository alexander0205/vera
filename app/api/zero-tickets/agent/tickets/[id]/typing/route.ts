import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';

const TYPING_TTL_MS = 4000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .update(tickets)
    .set({ agentTypingUntil: new Date(Date.now() + TYPING_TTL_MS) })
    .where(eq(tickets.id, ticketId));

  return NextResponse.json({ ok: true });
}
