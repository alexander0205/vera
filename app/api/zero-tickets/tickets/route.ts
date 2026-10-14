/**
 * API del cliente para Zero Tickets.
 * GET  → mi ticket más reciente (para restaurar historial) + info de cola.
 * POST → mandar un mensaje. Si no tengo ticket abierto/esperando, crea uno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';
import { calcularEspera, registrarMensajeCliente } from '@/lib/zero-tickets/mensaje-cliente';
import { obtenerMensajesDeTicket } from '@/lib/db/ticket-mensajes';
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const { content } = (await req.json()) as { content: string };
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  }

  try {
    const ticketId = await registrarMensajeCliente(teamId, user, content);
    return NextResponse.json({ ticketId });
  } catch (err) {
    console.error('[zero-tickets/tickets POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id)))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (!ticket) {
    const espera = await calcularEspera();
    return NextResponse.json({ ticket: null, messages: [], espera });
  }

  const [messages, call] = await Promise.all([
    obtenerMensajesDeTicket(ticket.id),
    obtenerLlamadaVigente(ticket.id),
  ]);

  // El poll pega cada 1.5s mientras el chat está abierto — escribir acá en
  // cada tick, aunque no haya nada nuevo que marcar como leído, multiplica
  // los writes contra la DB por nada. Solo se actualiza si de verdad hay
  // mensajes más nuevos que la última marca.
  if (!ticket.lastReadByUserAt || ticket.lastMessageAt > ticket.lastReadByUserAt) {
    await db.update(tickets).set({ lastReadByUserAt: new Date() }).where(eq(tickets.id, ticket.id));
  }

  const espera = ticket.status === 'esperando' ? await calcularEspera() : null;

  return NextResponse.json({
    ticket: { ...ticket, agentTyping: ticket.agentTypingUntil ? ticket.agentTypingUntil > new Date() : false },
    messages,
    espera,
    call,
  });
}
