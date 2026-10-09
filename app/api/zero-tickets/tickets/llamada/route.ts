/**
 * GET /api/zero-tickets/tickets/llamada — ¿me está llamando soporte?
 *
 * Lo que sondea el LlamadaGlobalProvider desde cada pestaña. Antes pedía
 * `GET /api/zero-tickets/tickets`, que devuelve la conversación ENTERA —todos
 * los mensajes con sus adjuntos—, la cola de espera, y además marca los
 * mensajes como leídos. Del resultado solo usaba `call`. Así que cada 3 s, en
 * cada pestaña, se traía el historial completo desde Neon para tirarlo, y el
 * agente veía «leído» en mensajes que nadie había abierto.
 *
 * Aquí: el ticket más reciente (id, estado y último mensaje) y su llamada
 * vigente. Nada de mensajes, y no marca nada como leído: eso sigue siendo
 * cosa del chat abierto.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';
import { esConversacionViva } from '@/lib/sondeo/intervalos';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  // Sin `conErrorJson` a propósito: esta ruta la pide cada pestaña cada pocos
  // segundos, y un fallo persistente llenaría `system_logs` con una fila por
  // pregunta. Va al log de la función, y el cliente trata el 500 como un
  // tropiezo pasajero y reintenta en el turno siguiente.
  try {
    // El mismo ticket que mira el chat (el más reciente): iniciar una llamada
    // le sube `last_message_at`, así que una llamada sobre un ticket viejo lo
    // trae arriba.
    const [ticket] = await db
      .select({ id: tickets.id, status: tickets.status, lastMessageAt: tickets.lastMessageAt })
      .from(tickets)
      .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id)))
      .orderBy(desc(tickets.lastMessageAt))
      .limit(1);

    if (!ticket) return NextResponse.json({ call: null, conversacionViva: false });

    const call = await obtenerLlamadaVigente(ticket.id);

    return NextResponse.json({
      call,
      conversacionViva: esConversacionViva(ticket.status, ticket.lastMessageAt.getTime(), Date.now()),
    });
  } catch (err) {
    console.error('[zero-tickets/tickets/llamada GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
