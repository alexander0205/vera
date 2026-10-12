import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { status } = (await req.json()) as { status: string };
  if (status !== 'abierto' && status !== 'cerrado') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  // UPDATE e INSERT en paralelo — no dependen entre sí. `allSettled` porque
  // si el ticketId no existe, el INSERT revienta por la FK a `tickets`, y
  // con `all` eso taparía el 404 limpio con un 500.
  const [updateResult, insertResult] = await Promise.allSettled([
    db.update(tickets)
      .set({ status, closedAt: status === 'cerrado' ? new Date() : null, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
      .returning(),
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'system',
      content: status === 'cerrado' ? 'Ticket cerrado.' : 'Ticket reabierto.',
    }),
  ]);
  const updated = updateResult.status === 'fulfilled' ? updateResult.value[0] : undefined;
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (insertResult.status === 'rejected') {
    console.error('[zero-tickets/status] error insertando mensaje de sistema', insertResult.reason);
  }

  return NextResponse.json({ ticket: updated });
}
