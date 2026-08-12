// Limpia lo sembrado por seed-demo-pos-historial.ts (team 2).
// Uso: npx tsx scripts/cleanup-demo-pos-historial.ts
// Borra en orden de FK: pagos → comanda_items → comandas → mesas demo → docs.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, mesas, comandas } from '@/lib/db/schema';
import { and, eq, inArray, like } from 'drizzle-orm';

const MARCA = 'SEED-DEMO-POS';
const TEAM = 2;

(async () => {
  console.log('HOST', new URL(process.env.POSTGRES_URL!).host);

  const docs = await db.select({ id: ecfDocuments.id }).from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, TEAM), eq(ecfDocuments.notas, MARCA)));
  const docIds = docs.map(d => d.id);
  console.log('docs demo:', docIds.length ? docIds.join(', ') : '(ninguno)');

  const mesasDemo = await db.select({ id: mesas.id }).from(mesas)
    .where(and(eq(mesas.teamId, TEAM), like(mesas.nombre, 'DEMO %(BORRAR)')));
  const mesaIds = mesasDemo.map(m => m.id);

  // comandas de esas mesas (comanda_items caen por ON DELETE CASCADE).
  if (mesaIds.length) {
    await db.delete(comandas).where(and(eq(comandas.teamId, TEAM), inArray(comandas.mesaId, mesaIds)));
    await db.delete(mesas).where(inArray(mesas.id, mesaIds));
    console.log('mesas/comandas demo borradas:', mesaIds.join(', '));
  }

  if (docIds.length) {
    await db.delete(pagosRecibidos).where(inArray(pagosRecibidos.ecfDocumentId, docIds));
    await db.delete(ecfDocuments).where(inArray(ecfDocuments.id, docIds));
    console.log('pagos + docs demo borrados.');
  }

  console.log('LISTO.');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
