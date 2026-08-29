import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, teams, users } from '@/lib/db/schema';

export async function GET() {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const agentUsers = db.select({ id: users.id, name: users.name, email: users.email }).from(users).as('agent_users');

  const rows = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      onHold: tickets.onHold,
      createdAt: tickets.createdAt,
      lastMessageAt: tickets.lastMessageAt,
      unread: sql<boolean>`${tickets.lastReadByAgentAt} IS NULL OR ${tickets.lastMessageAt} > ${tickets.lastReadByAgentAt}`,
      userTyping: sql<boolean>`${tickets.userTypingUntil} IS NOT NULL AND ${tickets.userTypingUntil} > NOW()`,
      teamId: teams.id,
      teamName: teams.name,
      userName: users.name,
      userEmail: users.email,
      assignedAgentId: tickets.assignedAgentId,
      assignedAgentName: agentUsers.name,
      // Subquery correlacionada — usar nombre literal de tabla (tickets.id), no
      // ${tickets.id}. Drizzle interpola ${tickets.id} como un parámetro FIJO
      // (tomado de la primera fila), no como referencia de columna por fila,
      // causando que todas las filas devuelvan el mismo lastMessage.
      lastMessage: sql<string>`(
        SELECT content FROM ticket_messages
        WHERE ticket_messages.ticket_id = tickets.id
        ORDER BY created_at DESC LIMIT 1
      )`,
    })
    .from(tickets)
    .innerJoin(teams, eq(teams.id, tickets.teamId))
    .innerJoin(users, eq(users.id, tickets.userId))
    .leftJoin(agentUsers, eq(agentUsers.id, tickets.assignedAgentId))
    // Antes no filtraba nada, y no hacía falta: cada persona tenía UNA fila
    // reutilizada para siempre. Ahora cada conversación cerrada deja la suya,
    // así que sin este corte la cola se convierte en un archivo histórico que
    // crece sin techo. Se muestra lo que sigue vivo más lo cerrado en el
    // último día, para que el agente vea lo que acaba de despachar.
    .where(sql`${tickets.status} <> 'cerrado' OR ${tickets.closedAt} > NOW() - INTERVAL '24 hours'`)
    .orderBy(desc(tickets.lastMessageAt));

  return NextResponse.json({ tickets: rows });
}
