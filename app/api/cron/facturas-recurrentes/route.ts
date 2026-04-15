import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes, sequences, ecfDocuments, teams } from '@/lib/db/schema';
import { and, eq, lte, isNull, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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
      // Get a sequence for this tipo ECF
      const seq = await db
        .select()
        .from(sequences)
        .where(
          and(
            eq(sequences.teamId, fr.teamId),
            eq(sequences.tipoEcf, fr.tipoEcf),
          )
        )
        .limit(1);

      if (!seq[0] || seq[0].secuenciaActual > seq[0].secuenciaHasta) {
        results.push({ id: fr.id, status: 'skip', reason: 'no_sequence' });
        continue;
      }

      // Parse items
      let items: any[] = [];
      try { items = JSON.parse(fr.items); } catch {}

      const montoTotal = fr.totalEstimado;

      // Create the document as BORRADOR (requires manual review before emission)
      const encf = `E${fr.tipoEcf}${String(seq[0].secuenciaActual).padStart(10, '0')}`;

      await db.insert(ecfDocuments).values({
        teamId: fr.teamId,
        clientId: fr.clientId,
        encf,
        tipoEcf: fr.tipoEcf,
        estado: 'BORRADOR',
        montoTotal,
        totalItbis: 0,
        notas: fr.notas ?? `Factura recurrente: ${fr.nombre}`,
      });

      // Advance the sequence
      await db.update(sequences)
        .set({ secuenciaActual: seq[0].secuenciaActual + BigInt(1), updatedAt: new Date() })
        .where(eq(sequences.id, seq[0].id));

      // Calculate next emission date
      const nextDate = new Date(fr.proximaEmision);
      if (fr.frecuencia === 'semanal') nextDate.setDate(nextDate.getDate() + 7);
      else if (fr.frecuencia === 'quincenal') nextDate.setDate(nextDate.getDate() + 15);
      else if (fr.frecuencia === 'mensual') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (fr.frecuencia === 'trimestral') nextDate.setMonth(nextDate.getMonth() + 3);
      else if (fr.frecuencia === 'anual') nextDate.setFullYear(nextDate.getFullYear() + 1);

      const nextStr = nextDate.toISOString().slice(0, 10);

      // Check if past end date
      const pastEnd = fr.fechaFin && nextStr > fr.fechaFin;

      await db.update(facturasRecurrentes)
        .set({
          proximaEmision: nextStr,
          facturasEmitidas: fr.facturasEmitidas + 1,
          estado: pastEnd ? 'pausada' : 'activa',
          updatedAt: new Date(),
        })
        .where(eq(facturasRecurrentes.id, fr.id));

      results.push({ id: fr.id, status: 'ok', encf });
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
