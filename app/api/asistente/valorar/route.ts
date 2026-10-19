/**
 * POST /api/asistente/valorar { mensajeId, valor: 1 | -1 | 0, motivo? }
 *
 * 👍 / 👎 sobre una respuesta del asistente. 0 quita la valoración. Solo de las
 * respuestas del propio usuario en su empresa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { rateLimitDb } from '@/lib/rate-limit';

const MOTIVOS = ['dato-incorrecto', 'enlace-incorrecto', 'no-entendio', 'incompleto', 'otro'] as const;

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_valorar:${teamId}:${user.id}`, 120, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiadas valoraciones seguidas.' }, { status: 429 });

  const b = await req.json().catch(() => null);
  const id = Number(b?.mensajeId);
  const valor = Number(b?.valor);
  if (!Number.isInteger(id) || id <= 0 || ![1, -1, 0].includes(valor)) {
    return NextResponse.json({ error: 'Valoración inválida' }, { status: 400 });
  }
  const motivo = typeof b?.motivo === 'string' && (MOTIVOS as readonly string[]).includes(b.motivo) ? b.motivo : null;

  // El mensaje debe ser una respuesta del asistente de una conversación de esta persona.
  const [m] = await db.select({ id: asistenteMensajes.id }).from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .where(and(
      eq(asistenteMensajes.id, id),
      eq(asistenteMensajes.rol, 'assistant'),
      eq(asistenteConversaciones.teamId, teamId),
      eq(asistenteConversaciones.userId, user.id),
    )).limit(1);
  if (!m) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });

  await db.update(asistenteMensajes).set(
    valor === 0
      ? { valoracion: null, valoracionMotivo: null, valoradoEn: null }
      : { valoracion: valor, valoracionMotivo: valor === -1 ? motivo : null, valoradoEn: new Date() },
  ).where(eq(asistenteMensajes.id, id));

  return NextResponse.json({ ok: true, valoracion: valor === 0 ? null : valor });
}
