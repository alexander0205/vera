/**
 * POST /api/admin/notificaciones/leidas — «ya las vi», en la campana del panel.
 *
 * Mueve la marca de lectura de quien pregunta a este instante (la hora la pone
 * la base, no el navegador). Es una marca por persona para TODAS las empresas;
 * la de cada colegio (`notificaciones_leidas`) no se toca.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificacionesPlataformaLeidas } from '@/lib/db/schema';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';

export async function POST(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });

  try {
    await db.insert(notificacionesPlataformaLeidas)
      .values({ userId: a.user.id, leidoHasta: sql`now()` })
      .onConflictDoUpdate({ target: notificacionesPlataformaLeidas.userId, set: { leidoHasta: sql`now()` } });
  } catch (e) {
    console.error('[admin notificaciones] no se pudo marcar leído:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No disponible' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
