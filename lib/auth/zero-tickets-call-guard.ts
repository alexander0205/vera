import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, tickets } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isZeroTicketsAgent } from './zero-tickets-guard';

type Llamada = typeof ticketCalls.$inferSelect;

export interface CallParticipantOk {
  ok: true;
  role: 'user' | 'agent';
  call: Llamada;
}
export interface CallParticipantErr {
  ok: false;
  response: NextResponse;
}

/**
 * Autoriza al dueño del ticket (rol 'user') o a un agente de Zero Tickets
 * (rol 'agent') a tocar una llamada puntual. Ninguno de los dos por su
 * cuenta alcanza — se resuelve consultando de quién es el ticket detrás
 * de la llamada.
 */
export async function requireCallParticipant(
  callId: number,
): Promise<CallParticipantOk | CallParticipantErr> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const [row] = await db
    .select({ call: ticketCalls, ticketUserId: tickets.userId })
    .from(ticketCalls)
    .innerJoin(tickets, eq(tickets.id, ticketCalls.ticketId))
    .where(eq(ticketCalls.id, callId))
    .limit(1);

  if (!row) {
    return { ok: false, response: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  }

  if (row.ticketUserId === user.id) {
    return { ok: true, role: 'user', call: row.call };
  }
  if (await isZeroTicketsAgent(user)) {
    return { ok: true, role: 'agent', call: row.call };
  }
  return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
}
