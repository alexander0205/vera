/**
 * POST /api/rnc/sync
 *
 * Descarga el padrón de contribuyentes de la DGII (ZIP público),
 * parsea el TXT interno y actualiza la tabla rnc_padron en la BD.
 *
 * Retorna un stream SSE (text/event-stream) con eventos de progreso:
 *   { step: 'download' | 'extract' | 'prepare' | 'insert' | 'done' | 'error', message, count?, total? }
 */

import { NextRequest } from 'next/server';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { client, db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { systemSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const DGII_ZIP_URL = 'https://dgii.gov.do/app/WebApps/Consultas/rnc/DGII_RNC.zip';
const BATCH_SIZE   = 5000;

export const maxDuration = 300; // 5 min — necesario para sync completo en Vercel

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
          { status: 200 }
        );
      }
    }
  }

  const startTime = Date.now();
  const encoder   = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream may be closed by client
        }
      }

      try {
        // ── 1. Descargar ZIP ───────────────────────────────────────────────────
        send({ step: 'download', message: 'Descargando padrón de la DGII (~20 MB)…' });

        const res = await fetch(DGII_ZIP_URL, {
          headers: { 'User-Agent': 'EmiteDO/1.0' },
          signal:  AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
          throw new Error(`DGII respondió ${res.status}: ${res.statusText}`);
        }

        const arrayBuf = await res.arrayBuffer();
        const zipBuf   = Buffer.from(arrayBuf);

        // ── 2. Extraer y decodificar ───────────────────────────────────────────
        send({ step: 'extract', message: 'Extrayendo y decodificando (Windows-1252 → UTF-8)…' });

        const zip      = new AdmZip(zipBuf);
        const txtEntry = zip.getEntries().find((e) =>
          e.entryName.toUpperCase().endsWith('.TXT') ||
          e.entryName.toUpperCase().includes('RNC')
        );

        if (!txtEntry) {
          throw new Error('No se encontró archivo TXT en el ZIP de la DGII');
        }

        const content = iconv.decode(txtEntry.getData(), 'win1252');
        const lines   = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const total   = lines.length;

        // ── 3. Truncar tabla ───────────────────────────────────────────────────
        send({ step: 'prepare', message: `Preparando BD (${total.toLocaleString('es-DO')} registros)…`, total });
        await client`TRUNCATE TABLE rnc_padron`;

        // ── 4. Insertar en batches con UNNEST ──────────────────────────────────
        let count    = 0;
        let rncs:       string[]           = [];
        let nombres:    string[]           = [];
        let nombresCom: string[]           = [];
        let cats:       string[]           = [];
        let estados:    string[]           = [];
        let activs:     string[]           = [];

        async function flushBatch() {
          if (rncs.length === 0) return;
          await client`
            INSERT INTO rnc_padron
              (rnc, nombre, nombre_comercial, categoria, estado, actividad)
            SELECT
              UNNEST(${client.array(rncs)}::text[]),
              UNNEST(${client.array(nombres)}::text[]),
              NULLIF(UNNEST(${client.array(nombresCom)}::text[]), ''),
              NULLIF(UNNEST(${client.array(cats)}::text[]), ''),
              UNNEST(${client.array(estados)}::text[]),
              NULLIF(UNNEST(${client.array(activs)}::text[]), '')
          `;
          count += rncs.length;
          rncs = []; nombres = []; nombresCom = []; cats = []; estados = []; activs = [];
        }

        for (const line of lines) {
          const parts = line.split('|');
          if (parts.length < 2) continue;

          const rnc  = (parts[0] ?? '').trim().substring(0, 20);
          const nom  = (parts[1] ?? '').trim().substring(0, 255);
          if (!rnc || !nom) continue;

          rncs.push(rnc);
          nombres.push(nom);
          nombresCom.push((parts[2] ?? '').trim().substring(0, 255));
          cats.push((parts[3] ?? '').trim().substring(0, 3));
          estados.push((parts[5] ?? '').trim() || '2');
          activs.push((parts[6] ?? '').trim().substring(0, 10));

          if (rncs.length >= BATCH_SIZE) {
            await flushBatch();
            send({
              step:    'insert',
              count,
              total,
              message: `Insertando… ${count.toLocaleString('es-DO')} / ${total.toLocaleString('es-DO')}`,
            });
          }
        }

        await flushBatch(); // remanente

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        // ── Persist sync timestamp in system_settings ──────────────────────────
        const nowIso = new Date().toISOString();
        await db
          .insert(systemSettings)
          .values({ key: 'rnc_last_sync', value: nowIso })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: nowIso, updatedAt: new Date() },
          });

        send({
          step:     'done',
          count,
          total,
          duration: `${duration}s`,
          message:  `¡Sincronizado! ${count.toLocaleString('es-DO')} contribuyentes en ${duration}s`,
        });

      } catch (err: unknown) {
        console.error('[/api/rnc/sync]', err);
        const message = err instanceof Error ? err.message : 'Error interno';
        send({ step: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
