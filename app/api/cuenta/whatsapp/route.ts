/**
 * El WhatsApp de quien tiene la sesión, para avisarle de sus tareas.
 *
 *   GET            → { tieneWhatsapp, telefono }  (lo pide «Tareas» para saber si mostrar el aviso)
 *   POST { telefono } → lo guarda en `users.telefono`, ya en el formato del CRM
 *
 * Es el mismo campo que pide el onboarding: el WhatsApp es de la persona, no de
 * la empresa. Solo se usa para avisos (ver lib/notificaciones/whatsapp-tareas.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { aE164 } from '@/lib/whatsapp/telefono';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const tel = aE164(user.telefono);
  return NextResponse.json({ tieneWhatsapp: tel != null, telefono: tel });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json().catch(() => null) as { telefono?: unknown } | null;
  const tel = typeof body?.telefono === 'string' ? aE164(body.telefono) : null;
  if (!tel) return NextResponse.json({ error: 'Ese número no parece válido. Escríbelo con el código de área, ej.: 809 555 1234.' }, { status: 400 });
  await db.update(users).set({ telefono: tel, updatedAt: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true, telefono: tel });
}
