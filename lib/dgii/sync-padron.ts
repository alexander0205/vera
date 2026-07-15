/**
 * Sincronización del padrón RNC de la DGII.
 *
 * Descarga el ZIP público de la DGII, parsea el TXT (Windows-1252) y recarga
 * la tabla rnc_padron COMPLETA usando COPY FROM STDIN (una sola operación).
 *
 * Por qué COPY y no INSERT en batches:
 *   El padrón tiene ~780k filas. Insertar en batches de 5k = ~156 round-trips
 *   secuenciales que superan el maxDuration de Vercel (300s) → carga parcial.
 *   COPY transfiere todo en un stream → segundos, sin timeout.
 *
 * Layout del TXT de la DGII (delimitado por '|'):
 *   [0] RNC  [1] razón social  [2] nombre comercial  [3] actividad económica
 *   [4..7] vacíos  [8] fecha  [9] ESTADO (ACTIVO|SUSPENDIDO|DADO DE BAJA|…)
 *   [10] régimen de pagos (NORMAL)
 *
 * estado se normaliza a la convención que usa la app (app/api/rnc/search):
 *   ACTIVO → '2', SUSPENDIDO → '3', cualquier otro → '0'.
 */

import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { revalidateTag } from 'next/cache';
import { client, db } from '@/lib/db/drizzle';
import { systemSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const DGII_ZIP_URL = 'https://dgii.gov.do/app/WebApps/Consultas/rnc/DGII_RNC.zip';

const ESTADO_MAP: Record<string, string> = { ACTIVO: '2', SUSPENDIDO: '3' };

/** Escapa un campo para el formato text de COPY (escapa \, tab, newline, CR). */
function escCopy(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

export interface SyncProgress {
  step: 'download' | 'extract' | 'prepare' | 'insert' | 'done';
  message: string;
  count?: number;
  total?: number;
}

export interface SyncResult {
  inserted: number;
  total: number;
  durationSec: string;
  syncedAt: string;
}

/**
 * Descarga, parsea y recarga el padrón completo vía COPY.
 * @param onProgress callback opcional para emitir progreso (SSE en la ruta manual).
 */
export async function syncRncPadron(
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const started = Date.now();
  const emit = (p: SyncProgress) => onProgress?.(p);

  // ── 1. Descargar ZIP ────────────────────────────────────────────────────────
  emit({ step: 'download', message: 'Descargando padrón de la DGII (~22 MB)…' });
  const res = await fetch(DGII_ZIP_URL, {
    headers: { 'User-Agent': 'EmiteDO/1.0' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`DGII respondió ${res.status}: ${res.statusText}`);
  const zipBuf = Buffer.from(await res.arrayBuffer());

  // ── 2. Extraer y decodificar (Windows-1252 → UTF-8) ──────────────────────────
  emit({ step: 'extract', message: 'Extrayendo y decodificando…' });
  const zip = new AdmZip(zipBuf);
  const txtEntry = zip
    .getEntries()
    .find(
      (e) =>
        e.entryName.toUpperCase().endsWith('.TXT') ||
        e.entryName.toUpperCase().includes('RNC'),
    );
  if (!txtEntry) throw new Error('No se encontró archivo TXT en el ZIP de la DGII');

  const content = iconv.decode(txtEntry.getData(), 'win1252');
  const lines = content.split(/\r?\n/);
  const total = lines.length;

  // ── 3. Construir filas COPY (text format, tab-delimited, \N = null) ───────────
  emit({ step: 'prepare', message: `Procesando ${total.toLocaleString('es-DO')} líneas…`, total });

  const rows: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = line.split('|');
    if (p.length < 10) continue; // líneas malformadas

    const rnc = p[0].trim().substring(0, 20);
    const nom = p[1].trim().substring(0, 255);
    if (!rnc || !nom) continue;

    const com = p[2].trim().substring(0, 255);
    const act = p[3].trim().substring(0, 10);
    const estado = ESTADO_MAP[p[9].trim()] ?? '0';
    const cat = (p[10] ?? '').trim().substring(0, 3);

    rows.push(
      [
        escCopy(rnc),
        escCopy(nom),
        com ? escCopy(com) : '\\N',
        cat ? escCopy(cat) : '\\N',
        estado,
        act ? escCopy(act) : '\\N',
      ].join('\t'),
    );
  }

  // ── 4. TRUNCATE + COPY dentro de una transacción ─────────────────────────────
  // Si el COPY falla, el TRUNCATE hace rollback → la tabla no queda vacía.
  emit({ step: 'insert', message: `Cargando ${rows.length.toLocaleString('es-DO')} contribuyentes…`, count: rows.length, total });

  await client.begin(async (sql) => {
    await sql`TRUNCATE TABLE rnc_padron`;
    const writable = await sql`COPY rnc_padron (rnc, nombre, nombre_comercial, categoria, estado, actividad) FROM STDIN`.writable();
    let buf = '';
    for (const row of rows) {
      buf += row + '\n';
      if (buf.length >= 1 << 20) {
        writable.write(buf);
        buf = '';
      }
    }
    if (buf) writable.write(buf);
    await new Promise<void>((resolve, reject) => {
      writable.on('finish', () => resolve());
      writable.on('error', reject);
      writable.end();
    });
  });

  // ── 5. Persistir timestamp de sync ───────────────────────────────────────────
  const syncedAt = new Date().toISOString();
  await db
    .insert(systemSettings)
    .values({ key: 'rnc_last_sync', value: syncedAt })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: syncedAt, updatedAt: new Date() },
    });

  // Invalidar el cache server-side de /api/rnc/search: el padrón cambió, las
  // búsquedas cacheadas deben recalcularse. (Si se llamara fuera de un contexto
  // de request, revalidateTag lanzaría; no debe tumbar el sync.)
  try {
    // Firma del canary: revalidateTag(tag, profile) — mismo patrón que
    // lib/dgii/catalogos.ts.
    (revalidateTag as (tag: string, scope?: string) => void)('rnc-padron', 'max');
  } catch (e) {
    console.warn('[sync-padron] revalidateTag falló (no crítico):', e);
  }

  const durationSec = ((Date.now() - started) / 1000).toFixed(1);
  return { inserted: rows.length, total, durationSec, syncedAt };
}
