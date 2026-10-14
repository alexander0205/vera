/**
 * POST /api/asistente/derivar { conversacionId } → { ticketId }
 *
 * «Hablar con una persona»: abre (o continúa) el ticket de soporte con la
 * conversación del asistente como primer mensaje, y deja anotado en la
 * conversación a qué ticket se pasó. Así, al recargar, el panel sabe que ya se
 * derivó y no se abre un segundo ticket con lo mismo.
 *
 * El resumen se arma aquí con lo guardado en la base, no con lo que mande el
 * cliente: el agente humano lee lo que de verdad se habló.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { armarResumenParaAgente } from '@/lib/asistente/derivar';
import { registrarMensajeCliente } from '@/lib/zero-tickets/mensaje-cliente';

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.conversacionId)) {
    return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  }

  const [conv] = await db.select({ id: asistenteConversaciones.id, ticket: asistenteConversaciones.derivadaTicketId })
    .from(asistenteConversaciones)
    .where(and(
      eq(asistenteConversaciones.id, b.conversacionId),
      eq(asistenteConversaciones.teamId, teamId),
      eq(asistenteConversaciones.userId, user.id),
    )).limit(1);
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  // Ya derivada: no se manda la misma conversación dos veces.
  if (conv.ticket != null) return NextResponse.json({ ticketId: conv.ticket, yaDerivada: true });

  const mensajes = await db.select({ rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido })
    .from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conv.id))
    .orderBy(asc(asistenteMensajes.id))
    .limit(200);
  if (!mensajes.length) return NextResponse.json({ error: 'La conversación está vacía' }, { status: 400 });

  try {
    const ticketId = await registrarMensajeCliente(teamId, user, armarResumenParaAgente(mensajes));
    await db.update(asistenteConversaciones).set({ derivadaTicketId: ticketId })
      .where(eq(asistenteConversaciones.id, conv.id));
    return NextResponse.json({ ticketId });
  } catch (e) {
    console.error('[asistente/derivar]', e);
    return NextResponse.json({ error: 'No se pudo abrir el ticket. Intenta de nuevo.' }, { status: 500 });
  }
}
