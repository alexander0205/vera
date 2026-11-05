/**
 * Avisos push de este dispositivo, desde el PANEL del equipo de Zero.
 *
 * Lo mismo que `/api/notificaciones/push`, pero sin pedir una empresa activa: un
 * administrador nuevo puede no haber abierto ninguna. `push_suscripciones.team_id`
 * es obligatorio en la tabla, así que se guarda la empresa activa si la hay y,
 * si no, la más antigua; el aviso se manda por PERSONA (`user_id`), no por
 * empresa, así que ese dato solo cumple con la llave foránea.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { pushSuscripciones, teams } from '@/lib/db/schema';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { clavePublicaVapid } from '@/lib/notificaciones/push';

const suscripcion = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
});
const baja = z.object({ endpoint: z.string().url().max(2000) });

export async function GET() {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  return NextResponse.json({ publicKey: clavePublicaVapid() });
}

export async function POST(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  if (!clavePublicaVapid()) return NextResponse.json({ error: 'Los avisos push no están configurados.' }, { status: 503 });

  const parsed = suscripcion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Suscripción no válida' }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  const teamId = (await getTeamIdForUser())
    ?? (await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id)).limit(1))[0]?.id;
  if (!teamId) return NextResponse.json({ error: 'No hay empresas' }, { status: 409 });

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 300) || null;
  await db.insert(pushSuscripciones)
    .values({ userId: a.user.id, teamId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSuscripciones.endpoint,
      set: { userId: a.user.id, teamId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });

  const parsed = baja.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Falta el dispositivo' }, { status: 400 });
  // Solo las suyas: borrar por endpoint a secas dejaría desuscribir el celular de otro.
  await db.delete(pushSuscripciones).where(and(
    eq(pushSuscripciones.endpoint, parsed.data.endpoint),
    eq(pushSuscripciones.userId, a.user.id),
  ));
  return NextResponse.json({ ok: true });
}
