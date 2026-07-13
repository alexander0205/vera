/**
 * Cron — refresca los rollups de reportes financieros.
 *
 * Usa Vercel Cron (no pg_cron: en Neon pg_cron exige compute 24/7). El cron
 * despierta el compute, refresca la vista materializada CONCURRENTLY (sin
 * bloquear lecturas) y el compute vuelve a dormir.
 *
 * Guard: Authorization: Bearer <CRON_SECRET> — igual que los otros crons.
 */
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const t0 = Date.now();
  try {
    // CONCURRENTLY requiere el índice único de la migración 0054.
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reportes_ventas_lineas`);
    return Response.json({ ok: true, refreshed: ['mv_reportes_ventas_lineas'], ms: Date.now() - t0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Si la MV aún no existe (migración sin aplicar) o CONCURRENTLY falla en el
    // primer refresco (MV nunca poblada), intenta un refresco normal.
    if (/does not exist|has not been populated/i.test(msg)) {
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW mv_reportes_ventas_lineas`);
        return Response.json({ ok: true, refreshed: ['mv_reportes_ventas_lineas'], mode: 'non-concurrent', ms: Date.now() - t0 });
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        console.error('[cron/reportes-refresh] MV no disponible:', msg2);
        return Response.json({ ok: false, skipped: true, reason: msg2 }, { status: 200 });
      }
    }
    console.error('[cron/reportes-refresh] error:', msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
