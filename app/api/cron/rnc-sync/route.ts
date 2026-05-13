/**
 * GET /api/cron/rnc-sync
 *
 * Cron diario que sincroniza el padrón DGII automáticamente.
 * Protegido por CRON_SECRET (header Authorization: Bearer <secret>).
 * Programado en vercel.json — schedule diario.
 *
 * UPSERT en batches usando UNNEST. Compatible con schema rnc_padron actual:
 *   rnc | nombre | nombre_comercial | categoria | estado | actividad
 */

import { NextRequest } from 'next/server';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { client, db } from '@/lib/db/drizzle';
import { systemSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const DGII_ZIP_URL = 'https://dgii.gov.do/app/WebApps/Consultas/rnc/DGII_RNC.zip';
const BATCH_SIZE   = 5000;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const started = Date.now();

  try {
    // 1. Descargar ZIP
    const res = await fetch(DGII_ZIP_URL);
    if (!res.ok) throw new Error(`Descarga falló: ${res.status}`);
    const zipBuf = Buffer.from(await res.arrayBuffer());

    // 2. Extraer TXT
    const zip = new AdmZip(zipBuf);
    const txtEntry = zip.getEntries().find(e =>
      e.entryName.toUpperCase().endsWith('.TXT') ||
      e.entryName.toUpperCase().includes('RNC'),
    );
    if (!txtEntry) throw new Error('TXT no encontrado en ZIP');
    const content = iconv.decode(txtEntry.getData(), 'win1252');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

    // 3. Truncar y reinsertar (UPSERT también funciona pero TRUNCATE es atómico para refresh completo)
    await client`TRUNCATE TABLE rnc_padron`;

    // 4. UPSERT en batches usando UNNEST
    let inserted = 0;
    let rncs: string[] = [];
    let nombres: string[] = [];
    let nombresCom: string[] = [];
    let cats: string[] = [];
    let estados: string[] = [];
    let activs: string[] = [];

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
        ON CONFLICT (rnc) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          nombre_comercial = EXCLUDED.nombre_comercial,
          categoria = EXCLUDED.categoria,
          estado = EXCLUDED.estado,
          actividad = EXCLUDED.actividad,
          actualizado_at = NOW()
      `;
      inserted += rncs.length;
      rncs = []; nombres = []; nombresCom = []; cats = []; estados = []; activs = [];
    }

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const rnc = (parts[0] ?? '').trim().substring(0, 20);
      const nom = (parts[1] ?? '').trim().substring(0, 255);
      if (!rnc || !nom) continue;

      rncs.push(rnc);
      nombres.push(nom);
      nombresCom.push((parts[2] ?? '').trim().substring(0, 255));
      cats.push((parts[3] ?? '').trim().substring(0, 3));
      estados.push((parts[5] ?? '').trim() || '2');
      activs.push((parts[6] ?? '').trim().substring(0, 10));

      if (rncs.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }
    await flushBatch();

    // 5. Marcar última sync
    const now = new Date().toISOString();
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'rnc_last_sync'))
      .limit(1);
    if (existing[0]) {
      await db.update(systemSettings).set({ value: now }).where(eq(systemSettings.key, 'rnc_last_sync'));
    } else {
      await db.insert(systemSettings).values({ key: 'rnc_last_sync', value: now });
    }

    return Response.json({
      ok: true,
      inserted,
      durationSec: ((Date.now() - started) / 1000).toFixed(1),
      syncedAt: now,
    });
  } catch (e) {
    console.error('[cron rnc-sync] error:', e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
