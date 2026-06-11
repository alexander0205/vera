/**
 * POST /api/rnc/sync
 *
 * Descarga el padrón de contribuyentes de la DGII y recarga rnc_padron.
 * La lógica vive en lib/dgii/sync-padron.ts (compartida con el cron).
 * Usa COPY FROM STDIN → carga las ~780k filas sin timeout.
 *
 * Retorna un stream SSE (text/event-stream) con eventos de progreso:
 *   { step: 'download'|'extract'|'prepare'|'insert'|'done'|'error', message, count?, total? }
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { systemSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { syncRncPadron } from '@/lib/dgii/sync-padron';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('No autenticado', { status: 401 });

  // ── Cache check: skip if synced within the last 7 days (unless ?force=true) ──
  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (!force) {
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'rnc_last_sync'))
      .limit(1);

    if (existing[0]?.value) {
      const lastSync = new Date(existing[0].value);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (lastSync > sevenDaysAgo) {
        return Response.json(
          { skipped: true, lastSync: existing[0].value, reason: 'cached' },
          { status: 200 },
        );
      }
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream may be closed by client
        }
      };

      try {
        const result = await syncRncPadron((p) => send({ ...p }));
        send({
          step: 'done',
          ...result,
          message: `¡Sincronizado! ${result.inserted.toLocaleString('es-DO')} contribuyentes en ${result.durationSec}s`,
        });
      } catch (err: unknown) {
        console.error('[/api/rnc/sync]', err);
        send({ step: 'error', message: err instanceof Error ? err.message : 'Error interno' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
