/**
 * GET /api/cron/dgii-catalogos-sync
 *
 * Cron de Vercel — semanal (domingos 5am UTC). Los catálogos DGII cambian muy
 * raramente, pero esto garantiza que cualquier corrección en ecf-api fluye a
 * nuestra BD local sin intervención manual.
 *
 * Protegido por Authorization: Bearer ${CRON_SECRET}.
 * Devuelve counts por catálogo + ok/errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncAllCatalogos } from '@/lib/dgii/sync-catalogos';

export const maxDuration = 60;
export const dynamic    = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await syncAllCatalogos();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    console.error('[GET /api/cron/dgii-catalogos-sync]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
