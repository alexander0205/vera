/**
 * API del cliente para Zero Tickets.
 * GET  → mi ticket más reciente (para restaurar historial) + info de cola.
 * POST → mandar un mensaje. Si no tengo ticket abierto/esperando, crea uno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc, desc, sql, gte } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, ticketAttachments, agentPresence, teams } from '@/lib/db/schema';
import { enviarAlertaSlackBlocks } from '@/lib/slack';

const AGENTE_STALE_MIN = 2;
const MIN_POR_TICKET = 5;

async function calcularEspera() {
  const staleSince = new Date(Date.now() - AGENTE_STALE_MIN * 60_000);
  const [{ count: disponibles }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentPresence)
    .where(and(eq(agentPresence.isAvailable, true), gte(agentPresence.lastSeenAt, staleSince)));

  const [{ count: enCola }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(eq(tickets.status, 'esperando'));

  if (disponibles === 0) return { agentesDisponibles: 0, enCola, esperaMinutos: null };
  return { agentesDisponibles: disponibles, enCola, esperaMinutos: Math.ceil(enCola / disponibles) * MIN_POR_TICKET };
}

async function notificarNuevoTicketSlack(teamId: number, remitente: string, contenido: string) {
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
  const preview = contenido.length > 300 ? `${contenido.slice(0, 300)}…` : contenido;
  const baseUrl = process.env.BASE_URL ?? '';
  const teamName = team?.name ?? `team ${teamId}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🎫 Nuevo ticket', emoji: true } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Colegio:*\n${teamName}` },
      { type: 'mrkdwn', text: `*De:*\n${remitente}` },
    ]},
    { type: 'section', text: { type: 'mrkdwn', text: `>${preview}` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Abrir Zero Tickets', emoji: true }, url: `${baseUrl}/zero-tickets`, style: 'primary' },
    ]},
  ];

  await enviarAlertaSlackBlocks(
    blocks,
    `Nuevo ticket de ${teamName} (${remitente}): ${preview}`,
    process.env.SUPPORT_SLACK_WEBHOOK_URL,
  );
}

async function getOrCreateTicket(teamId: number, userId: number) {
  const [existing] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, userId)))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (existing && existing.status !== 'cerrado') return { ticket: existing, isNew: false };

  if (existing && existing.status === 'cerrado') {
    const [reopened] = await db
      .update(tickets)
      .set({ status: 'esperando', assignedAgentId: null, closedAt: null })
      .where(eq(tickets.id, existing.id))
      .returning();
    return { ticket: reopened, isNew: true };
  }

  const [created] = await db.insert(tickets).values({ teamId, userId }).returning();
  return { ticket: created, isNew: true };
}

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
    const { ticket, isNew } = await getOrCreateTicket(teamId, user.id);

    await db.insert(ticketMessages).values({
      ticketId: ticket.id,
      senderType: 'user',
      senderId: user.id,
      content: content.trim(),
    });

    if (isNew) {
      const espera = await calcularEspera();
      const textoEspera = espera.agentesDisponibles === 0
        ? 'Todos nuestros agentes están ocupados en este momento. Te vamos a responder apenas se libere uno.'
        : `Tiempo de espera estimado: ${espera.esperaMinutos} min.`;
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        senderType: 'system',
        messageType: 'text',
        content: `Tu ticket fue creado. ${textoEspera}`,
      });
    }

    await db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

    // Una vez que un agente toma el ticket, ya está mirando esta conversación
    // (el panel de agentes hace poll cada 1.5s) — seguir mandando un Slack
    // por cada mensaje de acá en más es ruido, no aviso. Solo notifica
    // mientras el ticket sigue sin dueño.
    if (!ticket.assignedAgentId) {
      notificarNuevoTicketSlack(teamId, user.name ?? user.email, content.trim()).catch((err) =>
        console.error('[zero-tickets] error notificando Slack', err),
      );
    }

    return NextResponse.json({ ticketId: ticket.id });
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

  const messages = await db
    .select({
      message: ticketMessages,
      attachment: ticketAttachments,
    })
    .from(ticketMessages)
    .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
    .where(eq(ticketMessages.ticketId, ticket.id))
    .orderBy(asc(ticketMessages.createdAt));

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
    messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })),
    espera,
  });
}
