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
//
// Corre cada 10 min SOLO de 07:00 a 19:59 hora dominicana (`11-23` en UTC).
// Cada pasada despierta a Neon, que después tarda 5 min en volver a dormirse:
// corriendo toda la noche lo tenía despierto la mitad de cada hora sin nadie
// usando el sistema (medido 2026-09-18: arrancaba a las xx:x0:08 y se dormía
// 5.4 min después, así hasta la mañana). Un ticket que se queda quieto de
// noche se cierra en la primera pasada de las 07:00; los sondeos del cliente
// no dependen de eso (ver `esConversacionViva` en lib/sondeo/intervalos.ts).
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
