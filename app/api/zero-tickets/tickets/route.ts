/**
 * API del cliente para Zero Tickets.
 * GET  → mi ticket más reciente (para restaurar historial) + info de cola.
 * POST → mandar un mensaje. Si no tengo ticket abierto/esperando, crea uno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, agentPresence, teams } from '@/lib/db/schema';
import { enviarAlertaSlackBlocks } from '@/lib/slack';
import { obtenerMensajesDeTicket } from '@/lib/db/ticket-mensajes';
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';

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

  // El tercer argumento es un OVERRIDE opcional, no el canal principal: si
  // `SUPPORT_SLACK_WEBHOOK_URL` no está puesta llega `undefined` y
  // `enviarAlertaSlackBlocks` cae solo a `SLACK_WEBHOOK_URL` (ver el `??` en
  // lib/slack.ts). Existe para poder mandar los tickets a un canal distinto
  // del de las alertas de infraestructura; sin ella, ambos van al mismo.
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

  // Ticket cerrado + mensaje nuevo = conversación nueva, FILA nueva. Antes se
  // reabría la misma fila, y con eso una persona tenía un único ticket para
  // toda su vida en el sistema. Tres consecuencias, todas reales:
  //
  //   1. El hilo no terminaba nunca. El problema del cuadre de caja de marzo
  //      quedaba arriba de la pregunta de hoy, en el mismo scroll.
  //   2. `ticket_ratings` tiene una fila por ticket: una vez calificado, toda
  //      calificación posterior chocaba con 409 «ya fue calificado». El agente
  //      de la segunda conversación heredaba la estrella de la primera y el
  //      promedio quedaba clavado en una muestra por persona, para siempre.
  //   3. No se podía contar cuántos tickets abrió un colegio: siempre uno.
  //
  // Reabrir sigue existiendo, pero es del AGENTE (botón «Reabrir»): ahí sí es
  // la misma conversación, que se cerró antes de tiempo.
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
