import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { and, eq, lte, isNull, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { generarFacturaDeRecurrente } from '@/lib/cobranza/recurrente';
import { equiposConProcesosVivos } from '@/lib/suscripcion/procesos';
import { AL_CANCELAR } from '@/lib/config/suscripcion';

// This endpoint is called by a cron job (e.g., Vercel Cron or external cron)
// Protect it with a secret token in the Authorization header
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Get all active recurring invoices that are due today or overdue
  const dueTodayInvoices = await db
    .select()
    .from(facturasRecurrentes)
    .where(
      and(
        eq(facturasRecurrentes.estado, 'activa'),
        lte(facturasRecurrentes.proximaEmision, today),
        or(
          isNull(facturasRecurrentes.fechaFin),
          lte(sql`current_date`, facturasRecurrentes.fechaFin),
        ),
      )
    );

  // Una recurrente emite sola todos los meses: sin este filtro, una empresa
  // que canceló en enero nos sigue generando comprobantes fiscales a su
  // nombre en junio. No se les toca el estado —siguen 'activa'— para que al
  // reactivar la suscripción vuelvan a correr sin restaurar nada.
  const vivos = AL_CANCELAR.pausarRecurrentes
    ? await equiposConProcesosVivos(dueTodayInvoices.map(fr => fr.teamId))
    : null;

  const results = [];

  for (const fr of dueTodayInvoices) {
    if (vivos && !vivos.has(fr.teamId)) {
      results.push({ id: fr.id, status: 'skip', reason: 'suscripción sin plan activo' });
      continue;
    }
    try {
      const result = await generarFacturaDeRecurrente(fr);
      if (!result.ok) {
        results.push({ id: fr.id, status: 'skip', reason: result.reason });
      } else {
        results.push({ id: fr.id, status: 'ok', encf: result.encf, documentoId: result.documentoId });
      }
    } catch (error) {
      results.push({ id: fr.id, status: 'error', error: String(error) });
    }
  }

  return NextResponse.json({
    processed: dueTodayInvoices.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
