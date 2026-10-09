import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketCallRecordings, tickets, users } from '@/lib/db/schema';

/**
 * Registro global de grabaciones — no por ticket. Vive en su propia pestaña
 * de la consola de agente (/zero-tickets/grabaciones), separado del chat.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select({
      id: ticketCallRecordings.id,
      role: ticketCallRecordings.role,
      duracionSegundos: ticketCallRecordings.duracionSegundos,
      createdAt: ticketCallRecordings.createdAt,
      ticketId: tickets.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(ticketCallRecordings)
    .innerJoin(ticketCalls, eq(ticketCalls.id, ticketCallRecordings.callId))
    .innerJoin(tickets, eq(tickets.id, ticketCalls.ticketId))
    .innerJoin(users, eq(users.id, tickets.userId))
    .orderBy(desc(ticketCallRecordings.createdAt));

  return NextResponse.json({ recordings: rows });
}
