/**
 * Avisos push de este dispositivo.
 *
 *   GET    → { publicKey }   la llave VAPID pública, o null si el servidor no
 *                            tiene push configurado (la campana esconde el botón)
 *   POST   → guarda la suscripción del navegador: { endpoint, keys: { p256dh, auth } }
 *   DELETE → { endpoint } la borra (el botón «Desactivar avisos»)
 *
 * El `endpoint` identifica al dispositivo y es único: suscribirse otra vez
 * desde el mismo navegador actualiza la fila en vez de duplicarla, y si otra
 * persona inicia sesión en ese mismo dispositivo la suscripción pasa a ser suya
 * —el aviso sigue a quien tiene la sesión abierta, no a quien la activó antes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { pushSuscripciones } from '@/lib/db/schema';
import { exigirAcceso } from '@/lib/notificaciones/acceso';
import { clavePublicaVapid } from '@/lib/notificaciones/push';

const suscripcion = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});

const baja = z.object({ endpoint: z.string().url().max(2000) });

export async function GET() {
  const acceso = await exigirAcceso();
  if (!acceso.ok) return acceso.response;
  return NextResponse.json({ publicKey: clavePublicaVapid() });
}

export async function POST(req: NextRequest) {
  const acceso = await exigirAcceso();
  if (!acceso.ok) return acceso.response;
  if (!clavePublicaVapid()) {
    return NextResponse.json({ error: 'Los avisos push no están configurados.' }, { status: 503 });
  }
  // Un rol que no recibe ningún tipo de aviso no tiene nada que activar.
  if (acceso.tipos.length === 0) {
    return NextResponse.json({ error: 'Tu rol no recibe avisos de pagos.' }, { status: 403 });
  }

  const parsed = suscripcion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Suscripción no válida' }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 300) || null;
  await db.insert(pushSuscripciones)
    .values({ userId: acceso.user.id, teamId: acceso.teamId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSuscripciones.endpoint,
      set: { userId: acceso.user.id, teamId: acceso.teamId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const acceso = await exigirAcceso();
  if (!acceso.ok) return acceso.response;

  const parsed = baja.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Falta el dispositivo' }, { status: 400 });

  // Solo las suyas: borrar por endpoint a secas dejaría a cualquiera desuscribir
  // el celular de otro si llegara a conocer la dirección.
  await db.delete(pushSuscripciones).where(and(
    eq(pushSuscripciones.endpoint, parsed.data.endpoint),
    eq(pushSuscripciones.userId, acceso.user.id),
  ));
  return NextResponse.json({ ok: true });
}
