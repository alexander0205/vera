import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [updated] = await db
    .update(tickets)
    .set({ assignedAgentId: user.id, status: 'abierto', updatedAt: new Date() })
    .where(and(eq(tickets.id, ticketId), isNull(tickets.assignedAgentId)))
    .returning();
  if (!updated) {
    const [existing] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({ error: 'Este ticket ya fue tomado por otro agente' }, { status: 409 });
  }

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: `${user.name ?? user.email} tomó este ticket.`,
  });

  return NextResponse.json({ ticket: updated });
}
