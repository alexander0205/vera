// Demo de variantes por almacén (Opción B) para probar el POS.
// Uso: npx tsx scripts/seed-demo-variantes-pos.ts
// Limpieza: npx tsx scripts/cleanup-demo-variantes-pos.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { db } from '@/lib/db/drizzle';
import { products, productVariants, productVariantAlmacenStock, almacenes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const TEAM = 2;
const ALMACEN_TERMINAL = 5; // "Almacen principal" — el que usa la terminal "Cafeteria 1"

async function crearProductoConVariantes(opts: {
  nombre: string; precioCents: number; almacenId: number;
  eje: string; variantes: { valor: string; stock: number; precioCents?: number }[];
}) {
  const total = opts.variantes.reduce((s, v) => s + v.stock, 0);
  const [prod] = await db.insert(products).values({
    teamId: TEAM, nombre: opts.nombre, precio: opts.precioCents, tasaItbis: '0.18',
    tipo: 'bien', activo: 'true', unidadMedida: 'Unidad', costo: 0, stockActual: total,
    controlaInventario: true, permiteVentaSinStock: true, visiblePos: true,
    variantAtributos: [{ nombre: opts.eje, valores: opts.variantes.map(v => v.valor) }],
  }).returning();

  const vars = await db.insert(productVariants).values(
    opts.variantes.map(v => ({
      teamId: TEAM, productId: prod.id,
      atributos: { [opts.eje]: v.valor }, nombre: v.valor,
      precio: v.precioCents ?? null, costo: 0,
      stockActual: v.stock, stockMinimo: 0,
    })),
  ).returning({ id: productVariants.id, nombre: productVariants.nombre, stockActual: productVariants.stockActual });

  const filas = vars.filter(v => v.stockActual > 0)
    .map(v => ({ teamId: TEAM, variantId: v.id, almacenId: opts.almacenId, stockActual: v.stockActual }));
  if (filas.length > 0) await db.insert(productVariantAlmacenStock).values(filas);

  return { prodId: prod.id, vars };
}

(async () => {
  console.log('HOST', new URL(process.env.POSTGRES_URL!).host);

  let [alm2] = await db.select().from(almacenes).where(and(eq(almacenes.teamId, TEAM), eq(almacenes.nombre, 'DEMO Sucursal 2 (BORRAR)')));
  if (!alm2) {
    [alm2] = await db.insert(almacenes).values({ teamId: TEAM, nombre: 'DEMO Sucursal 2 (BORRAR)' }).returning();
  }
  console.log('Almacén demo 2:', alm2.id);

  const A = await crearProductoConVariantes({
    nombre: 'DEMO Camisa Variantes (BORRAR)', precioCents: 50000, almacenId: ALMACEN_TERMINAL,
    eje: 'Talla', variantes: [
      { valor: 'M', stock: 5 },
      { valor: 'L', stock: 3 },
      { valor: 'XL', stock: 2, precioCents: 55000 },
    ],
  });
  console.log('A) DEMO Camisa Variantes → prodId', A.prodId, '| almacén 5 (M5/L3/XL2)');

  const B = await crearProductoConVariantes({
    nombre: 'DEMO Polo Talla+Color (BORRAR)', precioCents: 60000, almacenId: ALMACEN_TERMINAL,
    eje: 'Talla', variantes: [{ valor: 'S', stock: 4 }, { valor: 'M', stock: 6 }],
  });
  console.log('B) DEMO Polo → prodId', B.prodId, '| almacén 5 (S4/M6)');

  const C = await crearProductoConVariantes({
    nombre: 'DEMO Gorra OtroAlmacen (BORRAR)', precioCents: 30000, almacenId: alm2.id,
    eje: 'Talla', variantes: [{ valor: 'Única', stock: 9 }],
  });
  console.log('C) DEMO Gorra → prodId', C.prodId, '| SOLO en almacén demo', alm2.id);

  console.log('\nLISTO. En el POS (Cafeteria 1 / almacén 5) aparecen A y B; C no.');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
