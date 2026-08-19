// Demo del Historial de recibos del POS (rama v2). Siembra 8 recibos variados
// en el turno de caja ABIERTO del team 2 para mostrarle a Alex los filtros,
// el pago dividido, el crédito, la mesa (Unsettle) y un recibo Anulado.
//
// Uso:      npx tsx scripts/seed-demo-pos-historial.ts
// Limpieza: npx tsx scripts/cleanup-demo-pos-historial.ts
//
// Todo lo sembrado lleva la marca notas='SEED-DEMO-POS' (docs) y las mesas/
// productos-demo llevan '(BORRAR)' en el nombre → la limpieza es exacta.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, mesas, comandas, comandaItems, cajaTurnos, users } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

const MARCA = 'SEED-DEMO-POS';

// Productos reales visibles en el POS (team 2). precioUnitarioItem va en PESOS
// (lineasJson usa pesos; monto_total va en centavos).
const P = {
  Camisa:      { id: 186, nombre: 'Camisa',      precio: 1000 },
  Polocher:    { id: 167, nombre: 'Polocher',    precio: 600  },
  Prueba:      { id: 184, nombre: 'Prueba',      precio: 2000 },
  Mensualidad: { id: 164, nombre: 'MENSUALIDAD', precio: 3000 },
};

type Item = { p: typeof P[keyof typeof P]; qty: number };
type Pago = { metodo: string; pesos: number };

function lineasJson(items: Item[]) {
  return JSON.stringify(items.map((it, i) => ({
    id: i + 1, productoId: it.p.id, nombreItem: it.p.nombre, referencia: it.p.nombre,
    descripcionItem: '', cantidadItem: it.qty, precioUnitarioItem: it.p.precio,
    descuentoPct: 0, tasaItbis: 'exento', indicadorBienoServicio: '2',
  })));
}
const totalCents = (items: Item[]) => items.reduce((s, it) => s + it.p.precio * it.qty, 0) * 100;

(async () => {
  console.log('HOST', new URL(process.env.POSTGRES_URL!).host);

  // Turno abierto del cajero dev (team 2, user 4). Falla si no hay turno.
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'ferrerasalexander@gmail.com')).limit(1);
  const USER = u.id, TEAM = 2, ALMACEN = 5, TERMINAL = 2;
  const [turno] = await db.select({ id: cajaTurnos.id }).from(cajaTurnos)
    .where(and(eq(cajaTurnos.teamId, TEAM), eq(cajaTurnos.usuarioId, USER), eq(cajaTurnos.estado, 'ABIERTO')))
    .orderBy(desc(cajaTurnos.id)).limit(1);
  if (!turno) { console.error('No hay turno ABIERTO para el cajero dev en team 2. Abre uno en el POS primero.'); process.exit(1); }
  const TURNO = turno.id;
  console.log(`team ${TEAM} · cajero ${USER} · turno ${TURNO} · almacén ${ALMACEN}`);

  const HOY = new Date().toISOString().slice(0, 10);
  let seq = 100;

  async function recibo(opts: {
    tipoOrden: string; items: Item[]; pagos: Pago[]; cliente?: string;
    estado?: 'BORRADOR' | 'ANULADO'; tipoPago?: number;
  }) {
    seq++;
    const total = totalCents(opts.items);
    const anulado = opts.estado === 'ANULADO';
    const pagado = opts.pagos.length > 0 && !anulado;
    const [doc] = await db.insert(ecfDocuments).values({
      teamId: TEAM, encf: '', tipoEcf: 'sin-ncf',
      codigo: `FA-2026-DEMO-${String(seq).padStart(6, '0')}`,
      estado: opts.estado ?? 'BORRADOR',
      estadoPago: anulado ? 'ANULADA' : pagado ? 'PAGADA' : 'PENDIENTE',
      tipoOrden: opts.tipoOrden,
      montoTotal: total, totalItbis: 0,
      razonSocialComprador: opts.cliente ?? 'Consumidor Final',
      tipoPago: opts.tipoPago ?? 1,
      lineasJson: lineasJson(opts.items),
      almacenId: ALMACEN, turnoCajaId: TURNO, stockDescontado: false,
      createdBy: USER, notas: MARCA,
    }).returning({ id: ecfDocuments.id });

    for (const pg of opts.pagos) {
      await db.insert(pagosRecibidos).values({
        teamId: TEAM, ecfDocumentId: doc.id, montoCentavos: pg.pesos * 100,
        metodo: pg.metodo, fechaPago: HOY, turnoCajaId: TURNO, createdBy: USER,
      });
    }
    console.log(`  #${seq} ${opts.tipoOrden.padEnd(12)} ${opts.pagos.map(p => p.metodo).join('+') || '(sin pago)'}  RD$${total / 100}  → doc ${doc.id}`);
    return doc.id;
  }

  // 1 mostrador · efectivo
  await recibo({ tipoOrden: 'mostrador', items: [{ p: P.Camisa, qty: 1 }], pagos: [{ metodo: 'efectivo', pesos: 1000 }] });
  // 2 para-llevar · tarjeta
  await recibo({ tipoOrden: 'para-llevar', items: [{ p: P.Polocher, qty: 2 }], pagos: [{ metodo: 'tarjeta', pesos: 1200 }] });
  // 3 delivery · transferencia
  await recibo({ tipoOrden: 'delivery', items: [{ p: P.Prueba, qty: 1 }], pagos: [{ metodo: 'transferencia', pesos: 2000 }], cliente: 'Pedro Pérez (delivery)' });
  // 4 mostrador · crédito (fiado, sin pago)
  await recibo({ tipoOrden: 'mostrador', items: [{ p: P.Camisa, qty: 1 }], pagos: [], tipoPago: 2, cliente: 'Cliente a crédito' });
  // 5 mostrador · pago dividido efectivo + tarjeta
  await recibo({ tipoOrden: 'mostrador', items: [{ p: P.Camisa, qty: 1 }, { p: P.Polocher, qty: 1 }], pagos: [{ metodo: 'efectivo', pesos: 800 }, { metodo: 'tarjeta', pesos: 800 }] });
  // 6 mostrador · cuenta-estudiante
  await recibo({ tipoOrden: 'mostrador', items: [{ p: P.Mensualidad, qty: 1 }], pagos: [{ metodo: 'cuenta-estudiante', pesos: 3000 }], cliente: 'Estudiante Demo' });

  // 7 comer-aquí · efectivo · CON MESA (objetivo del Unsettle)
  const [mesa] = await db.insert(mesas).values({ teamId: TEAM, terminalId: TERMINAL, nombre: 'DEMO Mesa 5 (BORRAR)', zona: 'Salón' }).returning({ id: mesas.id });
  const items7: Item[] = [{ p: P.Polocher, qty: 2 }, { p: P.Camisa, qty: 1 }];
  const doc7 = await recibo({ tipoOrden: 'comer-aqui', items: items7, pagos: [{ metodo: 'efectivo', pesos: 2200 }], cliente: 'Mesa 5' });
  const [com] = await db.insert(comandas).values({
    teamId: TEAM, terminalId: TERMINAL, mesaId: mesa.id, turnoId: TURNO,
    estado: 'cobrada', ecfDocumentId: doc7, totalCentavos: totalCents(items7),
  }).returning({ id: comandas.id });
  await db.insert(comandaItems).values(items7.map(it => ({
    comandaId: com.id, productoId: it.p.id, nombre: it.p.nombre,
    precioCentavos: it.p.precio * 100, qty: it.qty, tasaItbis: 'exento', tipo: 'bien',
  })));
  console.log(`     └ mesa ${mesa.id} + comanda ${com.id} (cobrada) → Unsettle la reabre`);

  // 8 para-llevar · ANULADO (traza, sin pago)
  await recibo({ tipoOrden: 'para-llevar', items: [{ p: P.Polocher, qty: 1 }], pagos: [], estado: 'ANULADO' });

  console.log('\nLISTO. Abre /pos/historial (cajero dev, turno abierto).');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
