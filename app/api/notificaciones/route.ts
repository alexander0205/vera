/**
 * Las notificaciones de pagos de la empresa activa: la campana de arriba.
 *
 *   GET            → { items, noLeidas }   las últimas 20 que le tocan
 *   GET ?soloConteo=1 → { noLeidas }
 *
 * Qué ve cada persona: las de la empresa que su rol permite (ver
 * `PERMISOS_POR_TIPO`) y las PERSONALES suyas (`user_id`: lo que pasa en sus
 * tareas por revisar), tenga el rol que tenga.
 *
 * «No leída» es toda la creada después de la marca de la persona
 * (`notificaciones_leidas`) y dentro de los últimos 14 días. Ver ./tipos.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificaciones, notificacionesLeidas } from '@/lib/db/schema';
import { exigirAcceso } from '@/lib/notificaciones/acceso';
import { esNoLeida, umbralNoLeidas } from '@/lib/notificaciones/tipos';

const LIMITE = 20;

export async function GET(req: NextRequest) {
  const acceso = await exigirAcceso();
  if (!acceso.ok) return acceso.response;
  const { user, teamId, tipos } = acceso;

  const soloConteo = req.nextUrl.searchParams.get('soloConteo') === '1';

  const [marca] = await db.select({ leidoHasta: notificacionesLeidas.leidoHasta })
    .from(notificacionesLeidas)
    .where(and(eq(notificacionesLeidas.userId, user.id), eq(notificacionesLeidas.teamId, teamId)))
    .limit(1);
  const leidoHasta = marca?.leidoHasta ?? null;
  const ahora = new Date();

  const deLaEmpresa = and(
    eq(notificaciones.teamId, teamId),
    or(
      eq(notificaciones.userId, user.id),
      tipos.length > 0 ? and(isNull(notificaciones.userId), inArray(notificaciones.tipo, tipos)) : sql`false`,
    ),
  );
  const [{ n: noLeidas }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(notificaciones)
    .where(and(deLaEmpresa, gt(notificaciones.creadoEn, umbralNoLeidas(leidoHasta, ahora))));

  if (soloConteo) return NextResponse.json({ noLeidas });

  const filas = await db.select().from(notificaciones)
    .where(deLaEmpresa)
    .orderBy(desc(notificaciones.creadoEn), desc(notificaciones.id))
    .limit(LIMITE);

  return NextResponse.json({
    puede: true,
    noLeidas,
    items: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo,
      detalle: f.detalle,
      enlace: f.enlace,
      montoCentavos: f.montoCentavos,
      creadoEn: f.creadoEn.toISOString(),
      noLeida: esNoLeida(f.creadoEn, leidoHasta, ahora),
    })),
  });
}
