/**
 * Verificación del fix de cuadre de caja contra el branch Neon `hotfix-cuadre-caja-turno`.
 * NO tocar prod: correr con POSTGRES_URL del branch hotfix.
 *
 *   set -a; source .env.hotfix; set +a; npx tsx scripts/verify-cuadre-fix.ts
 *
 * Crea un BORRADOR de prueba con turnoCajaId, registra un pago efectivo vía la
 * MISMA función que usan las rutas arregladas (registrarPago), y comprueba que
 * calcularEsperado + getVentasPorMetodo ahora lo cuentan. Limpia al final.
 */
import { db } from '../lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { registrarPago } from '../lib/db/queries';
import { getTurno, calcularEsperado, getVentasPorMetodo } from '../lib/caja/core';

const TEAM = 10;
const TURNO = 4;       // usuario 4, ABIERTO
const USER = 4;
const PAGO_CTS = 25000; // RD$250 efectivo de prueba

function dop(c: number) { return `RD$${(c / 100).toFixed(2)}`; }

async function main() {
  const host = (process.env.POSTGRES_URL ?? '').replace(/\/\/[^@]+@/, '//<user:pass>@');
  console.log('DB:', host);
  if (!host.includes('ep-dry-mode-anuom1g1')) {
    throw new Error('ABORT: no apunta al branch hotfix. Revisa .env.hotfix.');
  }

  const turno = await getTurno(TEAM, TURNO);
  if (!turno) throw new Error('turno no encontrado');

  console.log('\n── ANTES ──');
  const antes = await calcularEsperado(TEAM, turno);
  console.log('ventasEfectivo:', dop(antes.ventasEfectivo), '| esperado:', dop(antes.esperado));
  console.log('porMetodo:', await getVentasPorMetodo(TEAM, TURNO));

  // Crear BORRADOR de prueba CON turnoCajaId (lo que ahora hace emitir borrador)
  const [doc] = await db.insert(ecfDocuments).values({
    teamId: TEAM, clientId: null, encf: '', codigo: `VERIFY-${TURNO}`,
    tipoEcf: 'sin-ncf', estado: 'BORRADOR', estadoPago: 'PENDIENTE',
    rncComprador: null, razonSocialComprador: 'VERIFY FIX', emailComprador: null,
    montoTotal: PAGO_CTS, totalItbis: 0, fechaEmision: new Date(),
    tipoPago: 1, createdBy: USER, turnoCajaId: TURNO,
  }).returning();
  console.log('\nBorrador prueba creado: doc', doc.id, 'turno_caja_id', doc.turnoCajaId);

  // Registrar pago efectivo vía la MISMA función de las rutas arregladas
  await registrarPago({
    teamId: TEAM, ecfDocumentId: doc.id, montoCentavos: PAGO_CTS,
    metodo: 'efectivo', fechaPago: new Date().toISOString().slice(0, 10),
    createdBy: USER, turnoCajaId: TURNO,
  });
  console.log('Pago efectivo registrado con turnoCajaId =', TURNO);

  console.log('\n── DESPUÉS ──');
  const despues = await calcularEsperado(TEAM, turno);
  console.log('ventasEfectivo:', dop(despues.ventasEfectivo), '| esperado:', dop(despues.esperado));
  console.log('porMetodo:', await getVentasPorMetodo(TEAM, TURNO));

  const delta = despues.ventasEfectivo - antes.ventasEfectivo;
  console.log('\nΔ ventasEfectivo:', dop(delta), delta === PAGO_CTS ? '✓ OK' : '✗ FALLO');

  // Limpieza
  await db.delete(pagosRecibidos).where(eq(pagosRecibidos.ecfDocumentId, doc.id));
  await db.delete(ecfDocuments).where(eq(ecfDocuments.id, doc.id));
  console.log('Limpieza: doc de prueba eliminado.');

  process.exit(delta === PAGO_CTS ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
