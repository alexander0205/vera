import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages, tickets } from '@/lib/db/schema';

const RAZONES_VALIDAS = new Set(['colgada', 'error', 'desconexion']);

function formatearDuracion(ms: number): string {
  const totalSeg = Math.round(Math.max(0, ms) / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  // Colgar es idempotente (a diferencia de signal/route.ts, que devuelve 409
  // ante una llamada ya no vigente): pedir que termine una llamada que ya
  // terminó no es un error, es el resultado que el cliente quería.
  if (auth.call.status !== 'pendiente' && auth.call.status !== 'activa') {
    return NextResponse.json({ call: auth.call });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason && RAZONES_VALIDAS.has(body.reason) ? body.reason : 'colgada';

    const ahora = new Date();

    // El where() exige status en ('pendiente','activa') además del id: entre
    // la lectura de requireCallParticipant y este UPDATE, algo más (p. ej.
    // una expiración perezosa concurrente) puede haber terminado esta misma
    // llamada. Sin el guard, este UPDATE la resucitaría / pisaría esa razón.
    const [updated] = await db
      .update(ticketCalls)
      .set({ status: 'terminada', endedAt: ahora, endedReason: reason })
      .where(and(eq(ticketCalls.id, callId), inArray(ticketCalls.status, ['pendiente', 'activa'])))
      .returning();

    if (!updated) {
      // Alguien más ya terminó/cambió esta llamada entre la lectura y la
      // escritura. El resultado que el cliente pedía (llamada no viva) ya
      // es cierto, así que devolvemos el estado actual en vez de fallar.
      const [current] = await db.select().from(ticketCalls).where(eq(ticketCalls.id, callId)).limit(1);
      return NextResponse.json({ call: current ?? null });
    }

    const duracionTexto = auth.call.answeredAt
      ? ` · ${formatearDuracion(ahora.getTime() - auth.call.answeredAt.getTime())}`
      : '';

    await Promise.all([
      db.insert(ticketMessages).values({
        ticketId: auth.call.ticketId,
        senderType: 'system',
        content: `Llamada terminada${duracionTexto}.`,
      }),
      db
        .update(tickets)
        .set({ lastMessageAt: ahora, updatedAt: ahora })
        .where(eq(tickets.id, auth.call.ticketId)),
    ]);

    return NextResponse.json({ call: updated });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/end POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
