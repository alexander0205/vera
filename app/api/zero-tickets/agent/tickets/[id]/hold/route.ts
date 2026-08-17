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

  const { onHold } = (await req.json()) as { onHold: boolean };
  if (typeof onHold !== 'boolean') {
    return NextResponse.json({ error: 'onHold inválido' }, { status: 400 });
  }

  const [updated] = await db
    .update(tickets)
    .set({ onHold, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: onHold ? 'Ticket puesto en espera.' : 'Ticket retomado, ya no está en espera.',
  });

  return NextResponse.json({ ticket: updated });
}
