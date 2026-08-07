/**
 * Siembra facturas de ejemplo para DEMOSTRAR el recargo por mora sin tener que
 * crearlas a mano. Cada factura ilustra un caso distinto y, para las vencidas,
 * genera la(s) Nota(s) de Débito por mora con el motor REAL.
 *
 * ⚠️  La configuración de mora es POR EQUIPO (no por factura). El script fija una
 *     config demo conocida en el team elegido y sigue un PERFIL:
 *
 *     • porcentaje (default) — 5% del saldo · 0 gracia · cada 30 días · sin límites.
 *       Cubre: mora sobre saldo neto (pagos/NC), periodicidad, mora simple, preview.
 *     • fijo — RD$300 fijo · 5 días de gracia · cada 20 días (personalizado) ·
 *       tope 20% del documento · máx 4 períodos.
 *       Cubre: modo monto-fijo (no depende del saldo), gracia, tope, máx períodos,
 *       periodicidad de días personalizados.
 *
 * Un solo team no puede tener dos configs a la vez, así que cada perfil se siembra
 * en un team distinto (p. ej. porcentaje en yisrael y fijo en Andrés Bello).
 *
 * Uso:
 *   SEED_PROFILE=porcentaje SEED_TEAM=2            npx tsx scripts/seed-mora-demo.ts
 *   SEED_PROFILE=fijo       SEED_TEAM_NAME="andres" npx tsx scripts/seed-mora-demo.ts
 *
 * Target del team: SEED_TEAM (id) tiene prioridad; si no, SEED_TEAM_NAME (ILIKE
 * parcial sobre teams.name); si no hay ninguno, cae en el id 2.
 *
 * Limpia:  SEED_TEAM=<id> npx tsx scripts/limpiar-mora-demo.ts
 *
 * Todas las filas creadas se marcan con encf/razón "DEMOMORA" para poder
 * borrarlas después sin tocar nada más.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
const TAG = 'DEMOMORA';
const CLIENTE = 'Cliente Demo Mora';

// ── Perfiles de configuración (en la moneda del motor: bps y centavos) ────────
type Perfil = {
  modo: 'porcentaje' | 'fijo';
  pctBps: number;        // solo modo porcentaje
  montoFijoCents: number;// solo modo fijo
  gracia: number;        // días de gracia tras el vencimiento
  periodo: number;       // cada cuántos días se repite (0 = una sola vez)
  topeBps: number;       // tope de mora ACUMULADA como % del documento (0 = sin tope)
  maxPeriodos: number;   // máx de períodos a cobrar (0 = sin límite)
};

const PERFILES: Record<string, Perfil> = {
  // Existente: % sobre el saldo, sin gracia ni límites.
  porcentaje: { modo: 'porcentaje', pctBps: 500, montoFijoCents: 0,     gracia: 0, periodo: 30, topeBps: 0,    maxPeriodos: 0 },
  // Nuevo: monto fijo + gracia + tope + máx períodos + periodicidad personalizada.
  fijo:       { modo: 'fijo',       pctBps: 0,   montoFijoCents: 30000, gracia: 5, periodo: 20, topeBps: 2000, maxPeriodos: 4 },
};

const NOMBRE_PERFIL = (process.env.SEED_PROFILE ?? 'porcentaje').toLowerCase();
const P = PERFILES[NOMBRE_PERFIL];
if (!P) {
  console.error(`Perfil desconocido: "${NOMBRE_PERFIL}". Usa "porcentaje" o "fijo".`);
  process.exit(1);
}

const DOP = (cents: number) => `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const menos = (dias: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - dias); return d.toISOString().slice(0, 10); };
const mas   = (dias: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

let TEAM: number;
let clientId: number;

/** Resuelve el team: SEED_TEAM (id) > SEED_TEAM_NAME (ILIKE) > 2. */
async function resolverTeam(): Promise<{ id: number; nombre: string }> {
  if (process.env.SEED_TEAM) {
    const id = Number(process.env.SEED_TEAM);
    const [t] = await sql`SELECT id, name FROM teams WHERE id = ${id} LIMIT 1`;
    if (!t) throw new Error(`No existe el team id ${id}.`);
    return { id: t.id as number, nombre: t.name as string };
  }
  if (process.env.SEED_TEAM_NAME) {
    const q = `%${process.env.SEED_TEAM_NAME}%`;
    const rows = await sql`SELECT id, name FROM teams WHERE name ILIKE ${q} ORDER BY id LIMIT 5`;
    if (rows.length === 0) throw new Error(`Ningún team coincide con "${process.env.SEED_TEAM_NAME}".`);
    if (rows.length > 1) {
      const lista = rows.map(r => `  #${r.id}  ${r.name}`).join('\n');
      throw new Error(`"${process.env.SEED_TEAM_NAME}" es ambiguo, coincide con varios:\n${lista}\nUsa SEED_TEAM=<id> exacto.`);
    }
    return { id: rows[0].id as number, nombre: rows[0].name as string };
  }
  const [t] = await sql`SELECT id, name FROM teams WHERE id = 2 LIMIT 1`;
  if (!t) throw new Error('No existe el team id 2 (default). Pasa SEED_TEAM o SEED_TEAM_NAME.');
  return { id: t.id as number, nombre: t.name as string };
}

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

/** Genera la mora `veces` veces (para ilustrar la periodicidad / topes / máx). */
async function generar(facturaId: number, veces = 1) {
  for (let i = 0; i < veces; i++) {
    const r = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    console.log(`      · período ${i + 1}: ${r.ok ? DOP(r.montoCentavos) : `(no aplica: ${r.reason})`}`);
  }
}

// ── Perfil PORCENTAJE: mora sobre saldo neto + periodicidad + preview ─────────
async function sembrarPorcentaje(creadas: { id: number; caso: string; espera: string }[]) {
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
}

// ── Perfil FIJO: monto fijo + gracia + tope + máx períodos + periodicidad 20 ──
async function sembrarFijo(creadas: { id: number; caso: string; espera: string }[]) {
  // Caso F1: modo fijo puro. Vencida 25 días (gracia 5, cada 20) → 2 períodos.
  //          El cargo es RD$300 fijo, NO depende del saldo (aquí grande: 50,000).
  console.log('F1) Modo fijo — RD$300 por período, no depende del saldo (factura 50,000)');
  const f1 = await factura({ nombre: 'Fijo saldo grande', montoCents: 5_000_000, tipoPago: 2, fechaLimite: menos(25), estadoPago: 'PENDIENTE' });
  await generar(f1, 2);
  creadas.push({ id: f1, caso: 'Modo fijo, saldo 50,000', espera: '2 moras de RD$300 = RD$600 (fijo, no %)' });

  // Caso F2: mismo modo fijo, saldo chico (5,000). Mismo RD$300 por período que F1.
  //          Demuestra que el monto fijo NO escala con el saldo. Tope 20% de 5,000
  //          = 1,000; 2×300 = 600 < 1,000, no topa.
  console.log('F2) Modo fijo — mismo RD$300 aunque el saldo sea chico (factura 5,000)');
  const f2 = await factura({ nombre: 'Fijo saldo chico', montoCents: 500_000, tipoPago: 2, fechaLimite: menos(25), estadoPago: 'PENDIENTE' });
  await generar(f2, 2);
  creadas.push({ id: f2, caso: 'Modo fijo, saldo 5,000', espera: '2 moras de RD$300 = RD$600 (igual que la de 50,000)' });

  // Caso F3: dentro de la gracia. Vencida 3 días < gracia 5 → NO hay mora hoy,
  //          pero el detalle proyecta el primer cargo para el día 5.
  console.log('F3) Dentro de la gracia (vencida 3 días, gracia 5) — sin mora aún, con preview');
  const f3 = await factura({ nombre: 'Dentro de gracia', montoCents: 2_000_000, tipoPago: 2, fechaLimite: menos(3), estadoPago: 'PENDIENTE' });
  await generar(f3); // se espera "(no aplica: no_vencida)" — la gracia aún no pasa
  creadas.push({ id: f3, caso: 'Dentro de gracia (vencida 3 de 5 días)', espera: 'Sin mora aún; preview RD$300 el día 5' });

  // Caso F4: tope de mora acumulada. Documento chico (1,000) → tope 20% = 200.
  //          El fijo de 300 se recorta a 200 en el primer período y luego topa.
  console.log('F4) Tope 20% del documento (factura 1,000 → tope RD$200) — el fijo se recorta y topa');
  const f4 = await factura({ nombre: 'Tope alcanzado', montoCents: 100_000, tipoPago: 2, fechaLimite: menos(45), estadoPago: 'PENDIENTE' });
  await generar(f4, 2); // período 1: RD$200 (topado); período 2: (no aplica: tope_alcanzado)
  creadas.push({ id: f4, caso: 'Tope 20% de 1,000', espera: '1 mora de RD$200 (fijo 300 topado); 2º no aplica' });

  // Caso F5: máx de períodos. Vencida 120 días (cada 20, gracia 5) → tocarían 6
  //          períodos, pero el máx = 4 los corta. Se intenta 5 veces; la 5ª no aplica.
  console.log('F5) Máx 4 períodos (vencida 120 días) — solo 4 moras, la 5ª no aplica');
  const f5 = await factura({ nombre: 'Maximo de periodos', montoCents: 10_000_000, tipoPago: 2, fechaLimite: menos(120), estadoPago: 'PENDIENTE' });
  await generar(f5, 5);
  creadas.push({ id: f5, caso: 'Máx 4 períodos', espera: '4 moras de RD$300 = RD$1,200; la 5ª no aplica (max_periodos)' });
}

(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  const t = await resolverTeam();
  TEAM = t.id;
  console.log(`\n→ Base de datos: ${host}`);
  console.log(`→ Team: #${TEAM} (${t.nombre})`);
  console.log(`→ Perfil: ${NOMBRE_PERFIL}\n`);

  // 1) Config demo del team según el perfil.
  await sql`UPDATE teams SET
    recargo_mora_activo = true,
    recargo_mora_modo = ${P.modo},
    recargo_mora_porcentaje = ${P.pctBps},
    recargo_mora_monto_cents = ${P.montoFijoCents},
    recargo_mora_dias_gracia = ${P.gracia},
    recargo_mora_periodicidad_dias = ${P.periodo},
    recargo_mora_compuesta = false,
    recargo_mora_tope_bps = ${P.topeBps},
    recargo_mora_max_periodos = ${P.maxPeriodos}
   WHERE id = ${TEAM}`;
  const resumen = P.modo === 'fijo'
    ? `${DOP(P.montoFijoCents)} fijo · ${P.gracia} días de gracia · cada ${P.periodo} días · tope ${(P.topeBps / 100).toFixed(0)}% del documento · máx ${P.maxPeriodos} períodos`
    : `${(P.pctBps / 100).toFixed(0)}% del saldo · ${P.gracia} días de gracia · cada ${P.periodo} días · sin límites`;
  console.log(`Config aplicada: ${resumen}.\n`);

  // 2) Cliente demo (reutiliza si ya existe).
  const [ex] = await sql`SELECT id FROM clients WHERE team_id = ${TEAM} AND razon_social = ${CLIENTE} LIMIT 1`;
  clientId = ex?.id ?? (await sql`
    INSERT INTO clients (team_id, razon_social, rnc) VALUES (${TEAM}, ${CLIENTE}, '00000000000') RETURNING id
  `)[0].id;

  const creadas: { id: number; caso: string; espera: string }[] = [];

  if (P.modo === 'fijo') await sembrarFijo(creadas);
  else                   await sembrarPorcentaje(creadas);

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
