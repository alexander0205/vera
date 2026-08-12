// Limpia los datos demo creados por seed-demo-variantes-pos.ts
// Uso: npx tsx scripts/cleanup-demo-variantes-pos.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { db } from '@/lib/db/drizzle';
import { products, productVariants, productVariantAlmacenStock, inventoryMovements, almacenes } from '@/lib/db/schema';
import { eq, and, like, inArray } from 'drizzle-orm';

const TEAM = 2;

(async () => {
  console.log('HOST', new URL(process.env.POSTGRES_URL!).host);
  const demo = await db.select({ id: products.id, nombre: products.nombre }).from(products)
    .where(and(eq(products.teamId, TEAM), like(products.nombre, 'DEMO %(BORRAR)')));
  const ids = demo.map(d => d.id);
  console.log('Productos demo a borrar:', demo);

  if (ids.length > 0) {
    const vars = await db.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.productId, ids));
    const varIds = vars.map(v => v.id);
    await db.delete(inventoryMovements).where(inArray(inventoryMovements.productoId, ids));
    if (varIds.length > 0) await db.delete(productVariantAlmacenStock).where(inArray(productVariantAlmacenStock.variantId, varIds));
    await db.delete(productVariants).where(inArray(productVariants.productId, ids));
    await db.delete(products).where(inArray(products.id, ids));
  }

  const alm2 = await db.select().from(almacenes).where(and(eq(almacenes.teamId, TEAM), eq(almacenes.nombre, 'DEMO Sucursal 2 (BORRAR)')));
  for (const a of alm2) {
    const refs = await db.select().from(productVariantAlmacenStock).where(eq(productVariantAlmacenStock.almacenId, a.id));
    if (refs.length === 0) await db.delete(almacenes).where(eq(almacenes.id, a.id));
    else console.log('Almacén demo', a.id, 'aún referenciado, no se borra');
  }
  console.log('cleanup listo');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
