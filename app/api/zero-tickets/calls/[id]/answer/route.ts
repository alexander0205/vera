import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages, tickets } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { accept } = (await req.json()) as { accept: boolean };
  if (typeof accept !== 'boolean') return NextResponse.json({ error: 'accept inválido' }, { status: 400 });

  try {
    const [row] = await db
      .select({ call: ticketCalls, ticketUserId: tickets.userId })
      .from(ticketCalls)
      .innerJoin(tickets, eq(tickets.id, ticketCalls.ticketId))
      .where(eq(ticketCalls.id, callId))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    // Solo el dueño del ticket puede responder su propia invitación.
    if (row.ticketUserId !== user.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    if (row.call.status !== 'pendiente') {
      return NextResponse.json({ error: 'Esta llamada ya no está pendiente' }, { status: 409 });
    }

    const ticketId = row.call.ticketId;

    // El where() exige status='pendiente' además del id: entre el SELECT y
    // este UPDATE, la expiración perezosa de `obtenerLlamadaVigente` (que
    // corre en cada poll) puede haber pasado esta misma fila a 'terminada'.
    // Sin el guard, este UPDATE la resucitaría a 'activa'/'rechazada' sin
    // darse cuenta.
    const [updated] = accept
      ? await db
          .update(ticketCalls)
          .set({ status: 'activa', answeredAt: new Date() })
          .where(and(eq(ticketCalls.id, callId), eq(ticketCalls.status, 'pendiente')))
          .returning()
      : await db
          .update(ticketCalls)
          .set({ status: 'rechazada', endedAt: new Date(), endedReason: 'rechazada' })
          .where(and(eq(ticketCalls.id, callId), eq(ticketCalls.status, 'pendiente')))
          .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Esta llamada ya no está pendiente' }, { status: 409 });
    }

    await Promise.all([
      db.insert(ticketMessages).values({
        ticketId,
        senderType: 'system',
        content: accept ? 'Llamada aceptada.' : 'Llamada rechazada.',
      }),
      db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticketId)),
    ]);

    return NextResponse.json({ call: updated });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/answer POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
