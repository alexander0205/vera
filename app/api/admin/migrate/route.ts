/**
 * POST /api/admin/migrate
 *   ?file=0025_cuentas_por_cobrar.sql
 *
 * One-shot migration runner. Lee un .sql del directorio lib/db/migrations/
 * y lo ejecuta contra la DB del entorno donde corre.
 *
 * Protegido por CRON_SECRET. Idempotente porque las migrations usan
 * IF NOT EXISTS y CREATE TABLE IF NOT EXISTS.
 *
 * Uso desde prod:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://emitedo.vercel.app/api/admin/migrate?file=0025_cuentas_por_cobrar.sql"
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET (mismo usado por crons en vercel.json)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileParam = url.searchParams.get('file');
  if (!fileParam || !/^[0-9a-z_-]+\.sql$/i.test(fileParam)) {
    return NextResponse.json(
      { error: 'Param `file` requerido, formato 0025_xxx.sql' },
      { status: 400 },
    );
  }

  // Prevenir path traversal — solo basename + match estricto del regex de arriba
  const safePath = join(process.cwd(), 'lib', 'db', 'migrations', fileParam);

  let content: string;
  try {
    content = await readFile(safePath, 'utf8');
  } catch (err) {
    return NextResponse.json(
      { error: `Migration file no encontrado: ${fileParam}` },
      { status: 404 },
    );
  }

  // Ejecutar el SQL completo. Drizzle/neon-http no soporta multi-statement
  // en una sola `execute` con sql template — tenemos que partir por ';' final
  // (ignorando los que están dentro de strings/comments — simplificación).
  const statements = content
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  const results: Array<{ idx: number; ok: boolean; error?: string }> = [];
  for (let i = 0; i < statements.length; i++) {
    try {
      await db.execute(sql.raw(statements[i]));
      results.push({ idx: i, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Algunas declaraciones pueden fallar idempotentemente (índices existentes
      // sin IF NOT EXISTS, etc.) — registramos pero seguimos.
      results.push({ idx: i, ok: false, error: msg });
    }
  }

  const ok = results.every(r => r.ok);
  const errores = results.filter(r => !r.ok);

  return NextResponse.json({
    file:        fileParam,
    statements:  statements.length,
    ok,
    errores,
    timestamp:   new Date().toISOString(),
  }, { status: ok ? 200 : 207 });
}
