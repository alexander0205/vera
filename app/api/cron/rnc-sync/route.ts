/**
 * GET /api/cron/rnc-sync
 *
 * Cron diario que sincroniza el padrón DGII automáticamente.
 * Protegido por CRON_SECRET (header Authorization: Bearer <secret>).
 * Programado en vercel.json — schedule diario.
 *
 * Llama internamente a la misma lógica de POST /api/rnc/sync pero sin SSE.
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

interface PadronRow {
  rnc: string;
  razon_social: string | null;
  nombre_comercial: string | null;
  actividad_economica: string | null;
  estado: string | null;
  tipo: string | null;
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET (Vercel cron auto-incluye este header)
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
    const entries = zip.getEntries();
    const txtEntry = entries.find(e => e.entryName.toUpperCase().endsWith('.TXT'));
    if (!txtEntry) throw new Error('TXT no encontrado en ZIP');
    const txt = iconv.decode(txtEntry.getData(), 'win1252');

    // 3. Parsear
    const rows: PadronRow[] = [];
    for (const line of txt.split('\n')) {
      const parts = line.split('|');
      if (parts.length < 4) continue;
      const rnc = parts[0]?.trim();
      if (!rnc) continue;
      rows.push({
        rnc,
        razon_social: parts[1]?.trim() || null,
        nombre_comercial: parts[2]?.trim() || null,
        actividad_economica: parts[3]?.trim() || null,
        estado: parts[9]?.trim() || null,
        tipo: parts[10]?.trim() || null,
      });
    }

    // 4. UPSERT en batches
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const values = chunk
        .map((_, idx) => {
          const o = idx * 6;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`;
        })
        .join(', ');
      const params = chunk.flatMap(r => [
        r.rnc, r.razon_social, r.nombre_comercial, r.actividad_economica, r.estado, r.tipo,
      ]);
      await client.unsafe(
        `INSERT INTO rnc_padron (rnc, razon_social, nombre_comercial, actividad_economica, estado, tipo)
         VALUES ${values}
         ON CONFLICT (rnc) DO UPDATE SET
           razon_social = EXCLUDED.razon_social,
           nombre_comercial = EXCLUDED.nombre_comercial,
           actividad_economica = EXCLUDED.actividad_economica,
           estado = EXCLUDED.estado,
           tipo = EXCLUDED.tipo`,
        params,
      );
      inserted += chunk.length;
    }

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

    const duration = ((Date.now() - started) / 1000).toFixed(1);
    return Response.json({
      ok: true,
      inserted,
      durationSec: duration,
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
