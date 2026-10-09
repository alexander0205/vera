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
 *
 * `rolPretendido` existe porque una misma persona puede cumplir LOS DOS
 * papeles: un platformRole='admin' pasa `isZeroTicketsAgent` y además puede
 * ser el dueño del ticket. Deduciendo el rol solo de la identidad, esos
 * casos caían siempre en la primera rama ('user') y las dos puntas de la
 * llamada terminaban con el mismo rol — cada una filtraba las señales del
 * "otro" lado y no veía nunca las del lado que sí estaba hablando, así que
 * el handshake no cerraba jamás. Por eso el rol lo declara quien llama
 * (que sabe de qué lado de la UI está) y acá solo se valida que tenga
 * derecho a reclamarlo.
 */
export async function requireCallParticipant(
  callId: number,
  rolPretendido?: 'user' | 'agent',
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

  const esDueno = row.ticketUserId === user.id;
  const esAgente = await isZeroTicketsAgent(user);
  if (!esDueno && !esAgente) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  if (rolPretendido === 'user' && !esDueno) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }
  if (rolPretendido === 'agent' && !esAgente) {
    return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  // Sin rol declarado se mantiene el criterio de antes (dueño primero), que
  // es el correcto para las rutas donde el rol no cambia el comportamiento.
  const role = rolPretendido ?? (esDueno ? 'user' : 'agent');
  return { ok: true, role, call: row.call };
}
