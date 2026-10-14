import { NextRequest, NextResponse } from 'next/server';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones } from '@/lib/db/schema';

/**
 * Retención de las conversaciones con el asistente.
 *
 * Una conversación guarda preguntas sobre el negocio y respuestas con cifras y
 * nombres de clientes. Se necesita un tiempo para auditar qué se consultó y
 * para pasársela a soporte, pero no para siempre: pasados RETENCION_DIAS sin
 * actividad se borra (los mensajes caen en cascada). Los tickets de soporte
 * que se hayan abierto desde una conversación conservan su propio resumen.
 *
 * Cron semanal (vercel.json). Mismo patrón de acceso que los demás crons:
 * Authorization: Bearer ${CRON_SECRET}.
 */
const RETENCION_DIAS = Number(process.env.ASISTENTE_RETENCION_DIAS ?? 180);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const dias = Number.isFinite(RETENCION_DIAS) && RETENCION_DIAS >= 30 ? RETENCION_DIAS : 180;
  const limite = new Date(Date.now() - dias * 24 * 60 * 60_000);

  const borradas = await db.delete(asistenteConversaciones)
    .where(lt(asistenteConversaciones.actualizadaEn, limite))
    .returning({ id: asistenteConversaciones.id });

  // Limpieza de la tabla de límites de uso del asistente que ya venció.
  await db.execute(sql`DELETE FROM rate_limits WHERE key LIKE 'asistente%' AND reset_at < NOW()`);

  return NextResponse.json({ ok: true, dias, conversacionesBorradas: borradas.length });
}
