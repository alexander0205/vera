/**
 * GET /api/asistente/pdf?mensajeId=123 → application/pdf
 *
 * El PDF de una respuesta del asistente. Solo del propio usuario y de su
 * empresa: el mensaje tiene que pertenecer a una conversación suya.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createElement } from 'react';
import { and, desc, eq, lt } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes, teams } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { aBloques } from '@/lib/asistente/bloques';
import { AsistentePDF } from '@/lib/pdf/AsistentePDF';
import { rateLimitDb } from '@/lib/rate-limit';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_pdf:${teamId}:${user.id}`, 30, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados PDF seguidos. Espera unos minutos.' }, { status: 429 });

  const id = Number(req.nextUrl.searchParams.get('mensajeId'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });

  const [m] = await db.select({
    id: asistenteMensajes.id, rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido,
    herramientas: asistenteMensajes.herramientas, conversacionId: asistenteMensajes.conversacionId,
  }).from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .where(and(
      eq(asistenteMensajes.id, id),
      eq(asistenteConversaciones.teamId, teamId),
      eq(asistenteConversaciones.userId, user.id),
    )).limit(1);
  if (!m || m.rol !== 'assistant') return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });

  // La pregunta que originó esta respuesta: el mensaje del usuario anterior.
  const [pregunta] = await db.select({ contenido: asistenteMensajes.contenido }).from(asistenteMensajes)
    .where(and(
      eq(asistenteMensajes.conversacionId, m.conversacionId),
      eq(asistenteMensajes.rol, 'user'),
      lt(asistenteMensajes.id, m.id),
    ))
    .orderBy(desc(asistenteMensajes.id)).limit(1);

  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);

  const generadoEn = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'long', timeStyle: 'short' });
  const buffer = await renderToBuffer(createElement(AsistentePDF, {
    data: {
      empresa: team?.nombre ?? 'Mi empresa',
      usuario: user.name ?? null,
      generadoEn,
      pregunta: pregunta?.contenido ?? null,
      bloques: aBloques(m.contenido),
      consultas: (m.herramientas ?? []).map((h) => (h.resumen ? `${h.nombre} (${h.resumen})` : h.nombre)),
    },
  }) as never);

  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename="asistente-zero-${fecha}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
