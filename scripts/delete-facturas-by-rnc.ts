/**
 * Borra facturas (ecf_documents) y sus pagos (pagos_recibidos, payments) de
 * todos los teams con un RNC dado. Útil para limpiar imports erróneos.
 *
 * Uso:
 *   npx tsx scripts/delete-facturas-by-rnc.ts <RNC>            # DRY RUN (solo cuenta)
 *   npx tsx scripts/delete-facturas-by-rnc.ts <RNC> --confirm  # borra de verdad
 *   npx tsx scripts/delete-facturas-by-rnc.ts <RNC> --confirm --solo-historica
 *
 * Flags:
 *   --confirm          ejecuta el borrado (sin él solo muestra qué borraría)
 *   --solo-historica   limita a estado='HISTORICA' (no toca e-CF reales DGII)
 *
 * Opera sobre la DB de POSTGRES_URL (.env). En dev = Docker local.
 */
import 'dotenv/config';
import { db } from '../lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, payments, teams } from '../lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

async function main() {
  const rnc = process.argv[2];
  const confirm = process.argv.includes('--confirm');
  const soloHistorica = process.argv.includes('--solo-historica');

  if (!rnc || rnc.startsWith('--')) {
    console.error('Uso: npx tsx scripts/delete-facturas-by-rnc.ts <RNC> [--confirm] [--solo-historica]');
    process.exit(1);
  }

  const ts = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.rnc, rnc));
  if (ts.length === 0) {
    console.log(`No hay teams con RNC ${rnc}.`);
    process.exit(0);
  }
  const teamIds = ts.map((t) => t.id);
  console.log(`Teams RNC ${rnc}: ${ts.map((t) => `#${t.id} ${t.name}`).join(' | ')}`);

  const docFilter = soloHistorica
    ? and(inArray(ecfDocuments.teamId, teamIds), eq(ecfDocuments.estado, 'HISTORICA'))
    : inArray(ecfDocuments.teamId, teamIds);

  const docs = await db.select({ id: ecfDocuments.id }).from(ecfDocuments).where(docFilter);
  const docIds = docs.map((d) => d.id);
  console.log(`Facturas a borrar${soloHistorica ? ' (solo HISTORICA)' : ''}: ${docIds.length}`);

  if (docIds.length === 0) {
    process.exit(0);
  }

  if (!confirm) {
    console.log('DRY RUN — nada borrado. Re-corre con --confirm para ejecutar.');
    process.exit(0);
  }

  const delPagos = await db.delete(pagosRecibidos).where(inArray(pagosRecibidos.ecfDocumentId, docIds)).returning({ id: pagosRecibidos.id });
  const delPayments = await db.delete(payments).where(inArray(payments.ecfDocumentId, docIds)).returning({ id: payments.id });
  const delDocs = await db.delete(ecfDocuments).where(inArray(ecfDocuments.id, docIds)).returning({ id: ecfDocuments.id });

  console.log(`Borrado OK → facturas: ${delDocs.length} | pagos_recibidos: ${delPagos.length} | payments: ${delPayments.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
