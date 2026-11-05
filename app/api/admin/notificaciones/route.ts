/**
 * La campana del PANEL del equipo de Zero.
 *
 *   GET              → { items, noLeidas, hayMas }   las últimas 20 que le tocan
 *   GET ?antes=<id>  → las 20 anteriores a esa
 *   GET ?soloConteo=1 → { noLeidas }
 *
 * A diferencia de `/api/notificaciones` (que mira UNA empresa, la activa), esta
 * lee las filas personales de quien pregunta (`user_id`) en TODAS las empresas:
 * lo que pasa en las tareas de los colegios que le tocan a Soporte (ver
 * lib/notificaciones/plataforma.ts). Solo administradores de la plataforma.
 *
 * «No leída» es toda la creada después de su marca (`notificaciones_plataforma_leidas`)
 * y dentro de los últimos 14 días: la misma regla que la campana del colegio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt, like, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificaciones, notificacionesPlataformaLeidas, teams } from '@/lib/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { esNoLeida, umbralNoLeidas } from '@/lib/notificaciones/tipos';

export const dynamic = 'force-dynamic';

const LIMITE = 20;

export async function GET(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  const userId = a.user.id;

  // Sin la tabla de marcas (migración 0216 sin correr) todo cuenta como no leído
  // dentro de la ventana, en vez de romper la campana.
  let leidoHasta: Date | null = null;
  try {
    const [marca] = await db.select({ leidoHasta: notificacionesPlataformaLeidas.leidoHasta })
      .from(notificacionesPlataformaLeidas).where(eq(notificacionesPlataformaLeidas.userId, userId)).limit(1);
    leidoHasta = marca?.leidoHasta ?? null;
  } catch (e) {
    console.error('[admin notificaciones] sin marca de lectura:', e instanceof Error ? e.message : e);
  }
  const ahora = new Date();
  // Solo las que apuntan al panel (`/admin/…`): las personales de un colegio que ya existían
  // (a un admin que participó en una tarea) llevan a la pantalla de ESE colegio, que desde
  // aquí no abre; esas siguen saliendo en la campana del colegio.
  const mias = and(eq(notificaciones.userId, userId), eq(notificaciones.tipo, 'tarea'), like(notificaciones.enlace, '/admin/%'));

  const [{ n: noLeidas }] = await db.select({ n: sql<number>`count(*)::int` }).from(notificaciones)
    .where(and(mias, gt(notificaciones.creadoEn, umbralNoLeidas(leidoHasta, ahora))));
  if (req.nextUrl.searchParams.get('soloConteo') === '1') return NextResponse.json({ noLeidas });

  const antes = Number(req.nextUrl.searchParams.get('antes'));
  const filas = await db.select({
    id: notificaciones.id, tipo: notificaciones.tipo, titulo: notificaciones.titulo, detalle: notificaciones.detalle,
    enlace: notificaciones.enlace, creadoEn: notificaciones.creadoEn, colegio: teams.name,
  }).from(notificaciones).innerJoin(teams, eq(teams.id, notificaciones.teamId))
    .where(Number.isInteger(antes) && antes > 0 ? and(mias, lt(notificaciones.id, antes)) : mias)
    .orderBy(desc(notificaciones.id)).limit(LIMITE + 1);

  return NextResponse.json({
    puede: true,
    noLeidas,
    hayMas: filas.length > LIMITE,
    items: filas.slice(0, LIMITE).map((f) => ({
      id: f.id, tipo: f.tipo, titulo: f.titulo, detalle: f.detalle, enlace: f.enlace,
      creadoEn: f.creadoEn.toISOString(), noLeida: esNoLeida(f.creadoEn, leidoHasta, ahora),
    })),
  });
}
