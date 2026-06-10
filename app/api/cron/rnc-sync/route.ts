/**
 * GET /api/cron/rnc-sync
 *
 * Cron diario que sincroniza el padrón DGII automáticamente.
 * Protegido por CRON_SECRET (header Authorization: Bearer <secret>).
 * Programado en vercel.json — schedule diario.
 *
 * La lógica vive en lib/dgii/sync-padron.ts (compartida con la ruta manual).
 * Usa COPY FROM STDIN para cargar las ~780k filas sin timeout.
 */

import { NextRequest } from 'next/server';
import { syncRncPadron } from '@/lib/dgii/sync-padron';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const result = await syncRncPadron();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron rnc-sync] error:', e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
