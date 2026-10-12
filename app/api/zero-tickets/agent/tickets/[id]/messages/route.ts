import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';
import { obtenerMensajesDeTicket } from '@/lib/db/ticket-mensajes';
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [messages, call, [ticket]] = await Promise.all([
    obtenerMensajesDeTicket(ticketId),
    obtenerLlamadaVigente(ticketId),
    db.select({ lastMessageAt: tickets.lastMessageAt, lastReadByAgentAt: tickets.lastReadByAgentAt }).from(tickets).where(eq(tickets.id, ticketId)).limit(1),
  ]);

  // El poll pega cada 1.5s mientras el agente tiene el ticket abierto —
  // escribir en cada tick aunque no haya nada nuevo que marcar como leído
  // multiplica los writes contra la DB por nada (mismo criterio que el poll
  // del cliente en app/api/zero-tickets/tickets/route.ts).
  if (ticket && (!ticket.lastReadByAgentAt || ticket.lastMessageAt > ticket.lastReadByAgentAt)) {
    await db.update(tickets).set({ lastReadByAgentAt: new Date() }).where(eq(tickets.id, ticketId));
  }

  return NextResponse.json({ messages, call });
}
