import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { onHold } = (await req.json()) as { onHold: boolean };
  if (typeof onHold !== 'boolean') {
    return NextResponse.json({ error: 'onHold inválido' }, { status: 400 });
  }

  // El UPDATE y el INSERT no dependen uno del otro (el mensaje solo necesita
  // el ticketId, que ya tenemos) — en serie duplicaban la espera de cada
  // acción del agente contra una DB ya lenta de por sí. `allSettled` en vez
  // de `all`: si el ticketId no existe, el INSERT revienta por la FK a
  // `tickets` — con `all` eso tira un 500 en vez de dejar responder el 404
  // limpio que ya sale de mirar el UPDATE.
  const [updateResult, insertResult] = await Promise.allSettled([
    db.update(tickets).set({ onHold, updatedAt: new Date() }).where(eq(tickets.id, ticketId)).returning(),
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'system',
      content: onHold ? 'Ticket puesto en espera.' : 'Ticket retomado, ya no está en espera.',
    }),
  ]);
  const updated = updateResult.status === 'fulfilled' ? updateResult.value[0] : undefined;
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (insertResult.status === 'rejected') {
    console.error('[zero-tickets/hold] error insertando mensaje de sistema', insertResult.reason);
  }

  return NextResponse.json({ ticket: updated });
}
