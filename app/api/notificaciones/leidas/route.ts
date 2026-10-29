/**
 * POST /api/notificaciones/leidas — «ya las vi».
 *
 * Mueve la marca de lectura de quien pregunta a este instante: todo lo creado
 * hasta ahora deja de contar como no leído. La hora la pone la base y no el
 * navegador, para que un reloj desajustado no deje avisos eternamente sin leer
 * ni se coma los que llegaron un segundo después.
 *
 * Es una marca por persona y empresa, no una fila por aviso: lo que una persona
 * lee no se lo marca como leído a las demás.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificacionesLeidas } from '@/lib/db/schema';
import { exigirAcceso } from '@/lib/notificaciones/acceso';

export async function POST() {
  const acceso = await exigirAcceso();
  if (!acceso.ok) return acceso.response;

  await db.insert(notificacionesLeidas)
    .values({ userId: acceso.user.id, teamId: acceso.teamId, leidoHasta: sql`now()` })
    .onConflictDoUpdate({
      target: [notificacionesLeidas.userId, notificacionesLeidas.teamId],
      set: { leidoHasta: sql`now()` },
    });

  return NextResponse.json({ ok: true });
}
