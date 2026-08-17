import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
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

  const [msg] = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      senderType: 'agent',
      senderId: user.id,
      messageType: 'screenshot_request',
      content: 'Te pedimos que adjuntes una captura de pantalla para poder ayudarte mejor.',
    })
    .returning();

  const now = new Date();
  await db.update(tickets).set({ lastMessageAt: now, updatedAt: now, lastReadByAgentAt: now }).where(eq(tickets.id, ticketId));

  return NextResponse.json({ message: msg });
}
