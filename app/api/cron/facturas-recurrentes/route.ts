import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { and, eq, lte, isNull, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { generarFacturaDeRecurrente } from '@/lib/cobranza/recurrente';

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

  const results = [];

  for (const fr of dueTodayInvoices) {
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
