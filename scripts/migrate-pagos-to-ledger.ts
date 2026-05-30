/**
 * Migración única: consolida pagos al ledger `pagos_recibidos` (source of truth).
 *
 * - Docs con pago inline (ecf_documents.pago_recibido='true', sin fila en el
 *   ledger) → crea la fila correspondiente en pagos_recibidos.
 * - Filas de la tabla `payments` (con ecf_document_id) sin equivalente en el
 *   ledger → migradas a pagos_recibidos.
 * Luego sincroniza el espejo inline desde el ledger.
 *
 * Uso: npx tsx scripts/migrate-pagos-to-ledger.ts [--confirm]
 */
import 'dotenv/config';
import { db } from '../lib/db/drizzle';
import { pagosRecibidos } from '../lib/db/schema';
import { sql } from 'drizzle-orm';
import { syncPagoMirror } from '../lib/db/queries';

interface InlineRow { id: number; team_id: number; cts: number; metodo: string | null; cuenta: string | null; fecha: string | null; femis: Date; }
interface PayRow { id: number; team_id: number; ecf_document_id: number; monto: number; metodo: string | null; referencia: string | null; fecha: string | null; }

async function main() {
  const confirm = process.argv.includes('--confirm');

  const inline = await db.execute(sql`
    SELECT d.id, d.team_id, coalesce(d.pago_valor_cts,0) AS cts, d.pago_metodo AS metodo,
           d.pago_cuenta AS cuenta, d.pago_fecha AS fecha, d.fecha_emision AS femis
    FROM ecf_documents d
    WHERE d.pago_recibido='true' AND coalesce(d.pago_valor_cts,0) > 0
      AND NOT EXISTS (SELECT 1 FROM pagos_recibidos p WHERE p.ecf_document_id = d.id)
  `) as unknown as InlineRow[];

  const pays = await db.execute(sql`
    SELECT pm.id, pm.team_id, pm.ecf_document_id, pm.monto, pm.metodo, pm.referencia,
           to_char(pm.fecha,'YYYY-MM-DD') AS fecha
    FROM payments pm
    WHERE pm.ecf_document_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pagos_recibidos p WHERE p.ecf_document_id = pm.ecf_document_id)
  `) as unknown as PayRow[];

  console.log(`inline-only a migrar: ${inline.length} | payments a migrar: ${pays.length}`);
  if (!confirm) { console.log('DRY RUN — re-corre con --confirm.'); process.exit(0); }

  const touched = new Set<string>();

  for (const d of inline) {
    const fecha = d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : new Date(d.femis).toISOString().slice(0, 10);
    await db.insert(pagosRecibidos).values({
      teamId: d.team_id, ecfDocumentId: d.id, montoCentavos: d.cts,
      metodo: d.metodo || 'otro', cuenta: d.cuenta || null, fechaPago: fecha,
      notas: 'Migrado de pago inline (al emitir)',
    });
    touched.add(`${d.team_id}:${d.id}`);
  }

  for (const p of pays) {
    const fecha = p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : new Date().toISOString().slice(0, 10);
    await db.insert(pagosRecibidos).values({
      teamId: p.team_id, ecfDocumentId: p.ecf_document_id, montoCentavos: p.monto,
      metodo: p.metodo || 'otro', referencia: p.referencia || null, fechaPago: fecha,
      notas: 'Migrado de tabla payments',
    });
    touched.add(`${p.team_id}:${p.ecf_document_id}`);
  }

  for (const key of touched) {
    const [teamId, docId] = key.split(':').map(Number);
    await syncPagoMirror(teamId, docId);
  }

  console.log(`Migrado. docs sincronizados: ${touched.size}`);
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1); });
