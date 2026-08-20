import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketCalls, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { ticketId } = (await req.json()) as { ticketId: number };
  if (typeof ticketId !== 'number' || Number.isNaN(ticketId)) {
    return NextResponse.json({ error: 'ticketId inválido' }, { status: 400 });
  }

  const [ticket] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });

  let call;
  try {
    [call] = await db
      .insert(ticketCalls)
      .values({ ticketId, requestedBy: user.id })
      .returning();
  } catch (err) {
    // 23505 = unique_violation — el índice parcial ya tiene una llamada
    // pendiente/activa en este ticket.
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'Ya hay una llamada en curso en este ticket' }, { status: 409 });
    }
    throw err;
  }

  await Promise.all([
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'system',
      content: `${user.name ?? user.email} inició una llamada.`,
    }),
    db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticketId)),
  ]);

  return NextResponse.json({ call });
}
