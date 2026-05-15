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

      // Si la recurrente es crédito (tipoPago=2) y tiene diasParaPago configurado,
      // calculamos fechaLimitePago = hoy + diasParaPago. Caso colegio: factura el
      // día 1, vence el día 5 → AR la detecta vencida el día 6 automáticamente.
      let fechaLimitePago: string | null = null;
      if (fr.tipoPago === 2 && fr.diasParaPago && fr.diasParaPago > 0) {
        const limite = new Date();
        limite.setDate(limite.getDate() + fr.diasParaPago);
        fechaLimitePago = limite.toISOString().slice(0, 10);
      }

      await db.insert(ecfDocuments).values({
        teamId: fr.teamId,
        clientId: fr.clientId,
        encf,
        tipoEcf: fr.tipoEcf,
        estado: 'BORRADOR',
        tipoPago: fr.tipoPago,
        fechaLimitePago,
        montoTotal,
        totalItbis: 0,
        notas: fr.notas ?? `Factura recurrente: ${fr.nombre}`,
      });

      // Advance the sequence
      await db.update(sequences)
        .set({ secuenciaActual: seq[0].secuenciaActual + BigInt(1), updatedAt: new Date() })
        .where(eq(sequences.id, seq[0].id));

      // Calculate next emission date. Para mensual/trimestral/anual usamos diaCobro
      // (si está definido) para evitar drift cuando el día > 28 (ej: Ene 31 + 1mes
      // no se convierte en Mar 3, sino que se clampa al último día del mes siguiente).
      const [py, pm, pd] = fr.proximaEmision.split('-').map(Number);
      const nextDate = new Date(py, pm - 1, pd);

      if (fr.frecuencia === 'semanal') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (fr.frecuencia === 'quincenal') {
        nextDate.setDate(nextDate.getDate() + 15);
      } else {
        const monthOffset =
          fr.frecuencia === 'mensual'    ? 1  :
          fr.frecuencia === 'trimestral' ? 3  :
          fr.frecuencia === 'anual'      ? 12 : 1;

        // Sumar meses preservando diaCobro (clamp al último día del mes destino)
        const targetMonth = nextDate.getMonth() + monthOffset;
        const targetYear  = nextDate.getFullYear() + Math.floor(targetMonth / 12);
        const normalizedMonth = ((targetMonth % 12) + 12) % 12;
        // Último día del mes destino
        const lastDayTarget = new Date(targetYear, normalizedMonth + 1, 0).getDate();
        const desiredDay    = fr.diaCobro ?? nextDate.getDate();
        const clampedDay    = Math.min(desiredDay, lastDayTarget);
        nextDate.setFullYear(targetYear, normalizedMonth, clampedDay);
      }

      const nextStr =
        `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

      // Check if past end date → finalizada (no más emisiones)
      const pastEnd = fr.fechaFin && nextStr > fr.fechaFin;

      await db.update(facturasRecurrentes)
        .set({
          proximaEmision: nextStr,
          facturasEmitidas: fr.facturasEmitidas + 1,
          estado: pastEnd ? 'finalizada' : 'activa',
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
