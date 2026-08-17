import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { content } = (await req.json()) as { content: string };
  if (!content || !content.trim()) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });

  const [msg] = await db
    .insert(ticketMessages)
    .values({ ticketId, senderType: 'agent', senderId: user.id, content: content.trim() })
    .returning();

  const now = new Date();

  const [current] = await db.select({ assignedAgentId: tickets.assignedAgentId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);

  // Si nadie lo tomó todavía, responder implica tomarlo — si no, el cliente
  // sigue viendo el banner de "esperando agente" después de ya recibir respuesta.
  const claimFields = current && current.assignedAgentId === null
    ? { assignedAgentId: user.id, status: 'abierto' }
    : {};

  await db
    .update(tickets)
    .set({ lastMessageAt: now, updatedAt: now, lastReadByAgentAt: now, ...claimFields })
    .where(eq(tickets.id, ticketId));

  return NextResponse.json({ message: msg });
}
