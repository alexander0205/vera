import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketMessages, ticketAttachments, tickets } from '@/lib/db/schema';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const messages = await db
    .select({ message: ticketMessages, attachment: ticketAttachments })
    .from(ticketMessages)
    .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));

  await db.update(tickets).set({ lastReadByAgentAt: new Date() }).where(eq(tickets.id, ticketId));

  return NextResponse.json({ messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })) });
}
