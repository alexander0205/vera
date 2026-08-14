import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, teams, users } from '@/lib/db/schema';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const agentUsers = db.select({ id: users.id, name: users.name, email: users.email }).from(users).as('agent_users');

  const rows = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      lastMessageAt: tickets.lastMessageAt,
      unread: sql<boolean>`${tickets.lastReadByAgentAt} IS NULL OR ${tickets.lastMessageAt} > ${tickets.lastReadByAgentAt}`,
      userTyping: sql<boolean>`${tickets.userTypingUntil} IS NOT NULL AND ${tickets.userTypingUntil} > NOW()`,
      teamId: teams.id,
      teamName: teams.name,
      userName: users.name,
      userEmail: users.email,
      assignedAgentId: tickets.assignedAgentId,
      assignedAgentName: agentUsers.name,
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
    .orderBy(desc(tickets.lastMessageAt));

  return NextResponse.json({ tickets: rows });
}
