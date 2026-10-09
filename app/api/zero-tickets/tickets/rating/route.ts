/**
 * API del cliente para calificar al agente de su ticket más reciente.
 * GET  → si el ticket más reciente se puede calificar (cerrado, con agente, sin calificación previa).
 * POST → registra la calificación (1-5 + comentario opcional).
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketRatings } from '@/lib/db/schema';

async function getUltimoTicket(teamId: number, userId: number) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, userId)))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);
  return ticket ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const ticket = await getUltimoTicket(teamId, user.id);
  if (!ticket) return NextResponse.json({ canRate: false, alreadyRated: false });

  const canRateBase = ticket.status === 'cerrado' && ticket.assignedAgentId != null;
  if (!canRateBase) return NextResponse.json({ canRate: false, alreadyRated: false });

  const [existing] = await db
    .select({ id: ticketRatings.id })
    .from(ticketRatings)
    .where(eq(ticketRatings.ticketId, ticket.id))
    .limit(1);

  const alreadyRated = Boolean(existing);
  return NextResponse.json({ canRate: !alreadyRated, alreadyRated });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const { rating, comment } = (await req.json()) as { rating: number; comment?: string };

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'La calificación debe ser un número entero entre 1 y 5' }, { status: 400 });
  }

  const ticket = await getUltimoTicket(teamId, user.id);
  if (!ticket) return NextResponse.json({ error: 'No tenés tickets para calificar' }, { status: 400 });

  if (ticket.status !== 'cerrado') {
    return NextResponse.json({ error: 'Solo se pueden calificar tickets cerrados' }, { status: 400 });
  }

  if (ticket.assignedAgentId == null) {
    return NextResponse.json({ error: 'Este ticket no tiene un agente asignado' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: ticketRatings.id })
    .from(ticketRatings)
    .where(eq(ticketRatings.ticketId, ticket.id))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'Este ticket ya fue calificado' }, { status: 409 });
  }

  try {
    await db.insert(ticketRatings).values({
      ticketId: ticket.id,
      agentId: ticket.assignedAgentId,
      rating,
      comment: comment?.trim() || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Este ticket ya fue calificado' }, { status: 409 });
    }
    console.error('[zero-tickets/tickets/rating POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
