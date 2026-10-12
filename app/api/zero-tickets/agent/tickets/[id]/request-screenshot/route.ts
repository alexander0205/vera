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

  // Independientes entre sí — el UPDATE no necesita el id del mensaje
  // insertado. En serie duplicaban la espera contra una DB ya lenta.
  const now = new Date();
  const [[msg]] = await Promise.all([
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'agent',
      senderId: user.id,
      messageType: 'screenshot_request',
      content: 'Te pedimos que adjuntes una captura de pantalla para poder ayudarte mejor.',
    }).returning(),
    db.update(tickets).set({ lastMessageAt: now, updatedAt: now, lastReadByAgentAt: now }).where(eq(tickets.id, ticketId)),
  ]);

  return NextResponse.json({ message: msg });
}
