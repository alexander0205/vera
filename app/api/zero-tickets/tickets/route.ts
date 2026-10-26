/**
 * API del cliente para Zero Tickets.
 * GET  → mi ticket más reciente (para restaurar historial) + info de cola.
 * POST → mandar un mensaje. Si no tengo ticket abierto/esperando, crea uno.
 * GET ?historial=1 → mis tickets (título, vista previa, estado) para la pestaña «Historial» del panel.
 * GET ?id=N → los mensajes de uno de MIS tickets, para leerlo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, sql } from 'drizzle-orm';
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

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const sp = req.nextUrl.searchParams;

  // Historial compartido con el asistente: solo MIS tickets de ESTA empresa.
  if (sp.get('historial') === '1') {
    const lista = await db.select({
      id: tickets.id, status: tickets.status, lastMessageAt: tickets.lastMessageAt,
      // Primera cosa que escribió la persona (el título) y lo último que se dijo (la vista previa).
      titulo: sql<string | null>`(select left(m.content, 160) from ticket_messages m where m.ticket_id = tickets.id and m.sender_type = 'user' and m.content is not null order by m.id asc limit 1)`,
      previa: sql<string | null>`(select left(m.content, 300) from ticket_messages m where m.ticket_id = tickets.id and m.sender_type <> 'system' and m.content is not null order by m.id desc limit 1)`,
      mensajes: sql<number>`(select count(*)::int from ticket_messages m where m.ticket_id = tickets.id)`,
    }).from(tickets)
      .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id)))
      .orderBy(desc(tickets.lastMessageAt))
      .limit(50);
    return NextResponse.json({ tickets: lista });
  }

  // Leer un ticket anterior: la pertenencia (empresa + persona) se comprueba aquí, no se confía en el id.
  if (sp.has('id')) {
    const id = Number(sp.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Ticket inválido' }, { status: 400 });
    const [t] = await db.select({ id: tickets.id, status: tickets.status, createdAt: tickets.createdAt, closedAt: tickets.closedAt })
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.teamId, teamId), eq(tickets.userId, user.id)))
      .limit(1);
    if (!t) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({ ticket: t, messages: await obtenerMensajesDeTicket(t.id) });
  }

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
