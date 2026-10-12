/**
 * DELETE /api/admin/whatsapp/config?teamId=9
 *
 * Desvincula el número propio de un colegio. A partir de ahí sus avisos vuelven
 * a salir por el número de Zero, que es el respaldo (ver resolverRemitente).
 *
 * Qué borra y qué no:
 *
 *  - Borra la fila de `whatsapp_config`: su negocioId, su llave y su webhook
 *    secret. Es lo que hace falta para poder volver a conectar desde cero.
 *  - NO borra el historial de mensajes. Esos son conversaciones que existieron
 *    y borrarlas al desconectar convertiría un cambio de configuración en una
 *    pérdida de datos.
 *  - NO desconecta nada del lado de Meta. El número sigue vinculado a su
 *    cuenta de WhatsApp Business y a su negocio en el CRM; lo que se corta es
 *    que Zero lo use. Para soltarlo de Meta hay que entrar al CRM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig, teams } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/whatsapp/admin-guard';

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get('teamId');
  const teamId = Number(raw);
  if (!raw || !Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'Falta ?teamId=' }, { status: 400 });
  }

  const [empresa] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  const borradas = await db.delete(whatsappConfig)
    .where(eq(whatsappConfig.teamId, teamId))
    .returning({ id: whatsappConfig.id });

  if (borradas.length === 0) {
    return NextResponse.json({ error: 'Esa empresa no tiene número propio: ya sale por el de Zero' }, { status: 409 });
  }

  console.info(`[admin whatsapp] desvinculado el número de "${empresa.nombre}" (team ${teamId})`);
  return NextResponse.json({ ok: true, empresa: empresa.nombre });
}
