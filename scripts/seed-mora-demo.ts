/**
 * Siembra facturas de ejemplo para DEMOSTRAR el recargo por mora sin tener que
 * crearlas a mano. Cada factura ilustra un caso distinto y, para las vencidas,
 * genera la(s) Nota(s) de Débito por mora con el motor REAL.
 *
 * ⚠️  La configuración de mora es POR EQUIPO (no por factura). Este script fija
 *     una config demo conocida en el team elegido:
 *        5% del saldo · 0 días de gracia · se repite cada 30 días · sin límites.
 *     Todas las facturas demo comparten esa config; lo que cambia por factura es
 *     el saldo (pagos / notas de crédito) y la antigüedad del vencimiento.
 *
 * Uso:   SEED_TEAM=2 npx tsx scripts/seed-mora-demo.ts
 * Limpia: SEED_TEAM=2 npx tsx scripts/limpiar-mora-demo.ts
 *
 * Todas las filas creadas se marcan con encf/razón "DEMOMORA" para poder
 * borrarlas después sin tocar nada más.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
const TEAM = Number(process.env.SEED_TEAM ?? 2);
const TAG = 'DEMOMORA';
const CLIENTE = 'Cliente Demo Mora';

// Config demo (en la moneda del motor: bps y centavos).
const PCT_BPS = 500;   // 5.00%
const GRACIA  = 0;     // al día siguiente del vencimiento
const PERIODO = 30;    // se repite cada 30 días

const DOP = (cents: number) => `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const menos = (dias: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - dias); return d.toISOString().slice(0, 10); };
const mas   = (dias: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

let clientId: number;

/** Crea una factura demo y devuelve su id. montoCents = total en centavos. */
async function factura(o: {
  nombre: string; montoCents: number; tipoPago: number;
  fechaLimite: string | null; estadoPago: string;
}): Promise<number> {
  const encf   = `${TAG}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const codigo = `DEMO-MORA-${o.nombre.replace(/[^\w]+/g, '-').slice(0, 30)}`;
  const linea  = JSON.stringify([{
    nombreItem: o.nombre, cantidadItem: 1, precioUnitarioItem: o.montoCents / 100,
    tasaItbis: 'exento', indicadorBienoServicio: '2',
  }]);
  const [f] = await sql`INSERT INTO ecf_documents
    (team_id, client_id, encf, codigo, tipo_ecf, estado, estado_pago, monto_total, total_itbis,
     tipo_pago, fecha_limite_pago, razon_social_comprador, rnc_comprador, lineas_json, notas, fecha_emision)
    VALUES (${TEAM}, ${clientId}, ${encf}, ${codigo}, '31', 'ACEPTADO', ${o.estadoPago}, ${o.montoCents}, 0,
     ${o.tipoPago}, ${o.fechaLimite}, ${CLIENTE}, '00000000000', ${linea}, ${`[${TAG}] ${o.nombre}`}, NOW())
    RETURNING id`;
  return f.id as number;
}

async function pago(facturaId: number, montoCents: number) {
  await sql`INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, metodo, fecha_pago)
    VALUES (${TEAM}, ${facturaId}, ${montoCents}, 'efectivo', NOW())`;
}

/** Nota de crédito del modelo viejo (reduce el saldo de la factura). */
async function notaCredito(facturaId: number, montoCents: number) {
  const encf = `${TAG}NC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  await sql`INSERT INTO ecf_documents
    (team_id, client_id, encf, codigo, tipo_ecf, estado, estado_pago, monto_total, total_itbis,
     tipo_pago, origen_documento_id, codigo_modificacion, razon_social_comprador, notas, fecha_emision)
    VALUES (${TEAM}, ${clientId}, ${encf}, 'DEMO-MORA-NC', '34', 'ACEPTADO', 'PENDIENTE', ${montoCents}, 0,
     2, ${facturaId}, 3, ${CLIENTE}, ${`[${TAG}] Nota de crédito demo`}, NOW())`;
}

/** Genera la mora `veces` veces (para ilustrar la periodicidad). */
async function generar(facturaId: number, veces = 1) {
  for (let i = 0; i < veces; i++) {
    const r = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    console.log(`      · período ${i + 1}: ${r.ok ? DOP(r.montoCentavos) : `(no aplica: ${r.reason})`}`);
  }
}

(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`\n→ Base de datos: ${host}`);
  console.log(`→ Team: ${TEAM}\n`);

  // 1) Config demo del team.
  await sql`UPDATE teams SET
    recargo_mora_activo = true,
    recargo_mora_modo = 'porcentaje',
    recargo_mora_porcentaje = ${PCT_BPS},
    recargo_mora_monto_cents = 0,
    recargo_mora_dias_gracia = ${GRACIA},
    recargo_mora_periodicidad_dias = ${PERIODO},
    recargo_mora_compuesta = false,
    recargo_mora_tope_bps = 0,
    recargo_mora_max_periodos = 0
   WHERE id = ${TEAM}`;
  console.log(`Config aplicada: 5% del saldo · 0 días de gracia · cada 30 días · sin límites.\n`);

  // 2) Cliente demo (reutiliza si ya existe).
  const [ex] = await sql`SELECT id FROM clients WHERE team_id = ${TEAM} AND razon_social = ${CLIENTE} LIMIT 1`;
  clientId = ex?.id ?? (await sql`
    INSERT INTO clients (team_id, razon_social, rnc) VALUES (${TEAM}, ${CLIENTE}, '00000000000') RETURNING id
  `)[0].id;

  const creadas: { id: number; caso: string; espera: string }[] = [];

  // Caso 1: vencida, saldo completo → 5% de 10,000 = 500.
  console.log('1) Vencida (10 días) — mora sobre el saldo completo');
  const f1 = await factura({ nombre: 'Vencida - saldo completo', montoCents: 1_000_000, tipoPago: 2, fechaLimite: menos(10), estadoPago: 'PENDIENTE' });
  await generar(f1);
  creadas.push({ id: f1, caso: 'Vencida saldo completo', espera: 'Mora RD$500 (5% de 10,000)' });

  // Caso 2: abono parcial → mora sobre el saldo reducido. 10,000 - 6,000 = 4,000 → 200.
  console.log('2) Abono parcial — mora sobre el saldo pendiente (no el total)');
  const f2 = await factura({ nombre: 'Abono parcial', montoCents: 1_000_000, tipoPago: 2, fechaLimite: menos(10), estadoPago: 'PARCIAL' });
  await pago(f2, 600_000);
  await generar(f2);
  creadas.push({ id: f2, caso: 'Abono parcial (pagó 6,000)', espera: 'Mora RD$200 (5% de 4,000)' });

  // Caso 3: nota de crédito → mora sobre el neto. 10,000 - 3,000 = 7,000 → 350.
  console.log('3) Con nota de crédito — mora sobre el neto');
  const f3 = await factura({ nombre: 'Con nota de credito', montoCents: 1_000_000, tipoPago: 2, fechaLimite: menos(10), estadoPago: 'PENDIENTE' });
  await notaCredito(f3, 300_000);
  await generar(f3);
  creadas.push({ id: f3, caso: 'Con NC de 3,000', espera: 'Mora RD$350 (5% de 7,000)' });

  // Caso 4: vencida hace 70 días con periodicidad 30 → 3 períodos de 500 (mora simple).
  console.log('4) Periódica (vencida 70 días) — 3 cargos iguales, mora simple');
  const f4 = await factura({ nombre: 'Periodica varios meses', montoCents: 1_000_000, tipoPago: 2, fechaLimite: menos(70), estadoPago: 'PENDIENTE' });
  await generar(f4, 3);
  creadas.push({ id: f4, caso: 'Periódica (3 períodos)', espera: '3 moras de RD$500 = RD$1,500' });

  // Caso 5: contado sin pago → NO genera mora automática.
  console.log('5) Contado sin pago — NO genera mora');
  const f5 = await factura({ nombre: 'Contado sin pago', montoCents: 500_000, tipoPago: 1, fechaLimite: null, estadoPago: 'PENDIENTE' });
  creadas.push({ id: f5, caso: 'Contado sin pago', espera: 'Sin mora (por cobrar, sin vencimiento)' });

  // Caso 6: pagada completa → sin mora.
  console.log('6) Pagada completa — sin mora');
  const f6 = await factura({ nombre: 'Pagada completa', montoCents: 500_000, tipoPago: 2, fechaLimite: menos(10), estadoPago: 'PAGADA' });
  await pago(f6, 500_000);
  creadas.push({ id: f6, caso: 'Pagada completa', espera: 'Sin mora (saldo 0)' });

  // Caso 7: aún no vencida → sin ND, pero el detalle proyecta la próxima mora.
  console.log('7) Aún no vencida — el detalle proyecta la próxima mora');
  const f7 = await factura({ nombre: 'Aun no vencida', montoCents: 800_000, tipoPago: 2, fechaLimite: mas(15), estadoPago: 'PENDIENTE' });
  creadas.push({ id: f7, caso: 'Aún no vencida (vence en 15 días)', espera: 'Preview: RD$400 (5% de 8,000)' });

  console.log('\n===== FACTURAS DEMO CREADAS =====');
  for (const c of creadas) {
    console.log(`  #${c.id}  ${c.caso}`);
    console.log(`         esperado: ${c.espera}`);
    console.log(`         detalle:  /dashboard/facturas/${c.id}`);
  }
  console.log('\nPara borrarlas todas: SEED_TEAM=' + TEAM + ' npx tsx scripts/limpiar-mora-demo.ts\n');

  await sql.end();
  process.exit(0);
})().catch(async (e) => {
  console.error('\n💥 ERROR:', e);
  await sql.end();
  process.exit(1);
});
