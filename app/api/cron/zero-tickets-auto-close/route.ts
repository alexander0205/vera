import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

// Umbral de inactividad (minutos) tras el cual un ticket "abierto" se cierra
// automáticamente. Fácil de ajustar.
const INACTIVIDAD_MINUTOS = 30;

// Este endpoint es invocado por el cron de Vercel (vercel.json → crons[]).
// Protegido con el mismo patrón que los demás crons del proyecto:
// Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const umbral = new Date(Date.now() - INACTIVIDAD_MINUTOS * 60_000);

  const candidatos = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.status, 'abierto'),
        eq(tickets.onHold, false),
        lt(tickets.lastMessageAt, umbral)
      )
    );

  const now = new Date();
  for (const t of candidatos) {
    await db
      .update(tickets)
      .set({ status: 'cerrado', closedAt: now, updatedAt: now })
      .where(eq(tickets.id, t.id));

    await db.insert(ticketMessages).values({
      ticketId: t.id,
      senderType: 'system',
      content: 'Ticket cerrado automáticamente por inactividad.',
    });
  }

  return NextResponse.json({
    cerrados: candidatos.length,
    timestamp: new Date().toISOString(),
  });
}
