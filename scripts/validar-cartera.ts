/**
 * Valida la cartera contra los casos reales del plan (paso 1, subpaso 7).
 *
 *   npx tsx scripts/validar-cartera.ts <teamId>
 *
 * SOLO LECTURA. Requiere que el team tenga los escenarios sembrados con
 * `scripts/seed-cartera-escenarios.ts`. Sirve para comprobar de una pasada que
 * la fórmula de saldo, las reglas de inclusión y la antigüedad siguen dando lo
 * mismo después de un cambio.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { getCuentasPorCobrar } from '@/lib/db/queries';
import { getDetalleCuenta } from '@/lib/cobranza/detalle';

const dop = (c: number) => (c / 100).toFixed(2);

let ok = 0, fail = 0;
function check(caso: string, cond: boolean, detalle = '') {
  if (cond) { ok++; console.log(`  ✅ ${caso}`); }
  else { fail++; console.log(`  ❌ ${caso}${detalle ? ` — ${detalle}` : ''}`); }
}

(async () => {
  const teamId = Number(process.argv[2]);
  if (!Number.isFinite(teamId)) {
    console.error('Uso: npx tsx scripts/validar-cartera.ts <teamId>');
    process.exit(1);
  }

  const { cuentas, totales, antiguedad } = await getCuentasPorCobrar(teamId, { limit: 2000 });
  const by = new Map(cuentas.map(c => [c.codigo ?? '', c]));
  const g = (slug: string) => by.get(`SEEDCXC-${slug}`);

  if (!g('ALDIA')) {
    console.error(`\n⚠️  El team ${teamId} no tiene los escenarios sembrados.`);
    console.error('   Corre primero: npx tsx scripts/seed-cartera-escenarios.ts ' + teamId);
    process.exit(1);
  }

  console.log(`\nCartera team ${teamId}: ${totales.count} cuentas · RD$${dop(totales.pendiente)} · ${totales.countVencidas} vencidas\n`);

  console.log('Fórmula de saldo');
  check('pago parcial: 1000 − 400 = 600', g('PARCIAL')?.saldo === 600_00, `saldo=${dop(g('PARCIAL')?.saldo ?? -1)}`);
  check('nota de crédito: 1000 − 300 = 700', g('CONNCID')?.saldo === 700_00);
  check('NC mayor que el saldo → fuera de cartera, nunca negativo', g('CONNCEXCESO') === undefined);
  check('factura + mora: 1000 + 50 = 1050', g('CONMORA')?.saldo === 1050_00);
  check('saldada que solo arrastra mora sigue en cartera', g('SALDADAMORA')?.saldo === 75_00);

  console.log('\nReglas de inclusión');
  check('anulada fuera',   g('ANULADA')   === undefined);
  check('rechazada fuera', g('RECHAZADA') === undefined);
  check('pagada fuera',    g('PAGADA')    === undefined);
  check('ninguna ND de mora aparece como cuenta propia',
    !cuentas.some(c => (c.codigo ?? '').startsWith('SEEDCXC-ND')));
  check('ninguna NC aparece como cuenta por cobrar', !cuentas.some(c => c.tipoEcf === '34'));
  check('NC código 2 (corrige texto) no reduce', g('CONNCCOD2')?.saldo === 1000_00);
  check('NC anulada no reduce',                   g('CONNCANUL')?.saldo === 1000_00);
  check('NC del modelo nuevo no reduce',          g('CONNCNUEVO')?.saldo === 1000_00);
  check('mora anulada no suma',   g('CONMORA')?.moraSaldo === 50_00);
  check('mora ya cobrada no suma', g('MORAPAGADA')?.moraSaldo === 0);

  console.log('\nVencimiento (corte medianoche RD)');
  check('vence hoy → NO vencida', g('HOY')?.vencida === false);
  check('venció ayer → 1 día',    g('VENC1')?.diasVencido === 1);
  check('45 / 75 / 100 días exactos',
    g('VENC45')?.diasVencido === 45 && g('VENC75')?.diasVencido === 75 && g('VENC100')?.diasVencido === 100);
  check('sin fecha límite → no vencida', g('SINFECHA')?.vencida === false);
  check('saldada con mora no cuenta como vencida (saldoFactura = 0)', g('SALDADAMORA')?.vencida === false);

  console.log('\nTotales y antigüedad');
  const suma = cuentas.reduce((s, c) => s + c.saldo, 0);
  check('suma de filas == total pendiente', suma === totales.pendiente, `${dop(suma)} vs ${dop(totales.pendiente)}`);
  const sumaCubetas = Object.values(antiguedad).reduce((s, b) => s + b.saldo, 0);
  check('cubetas suman el total', sumaCubetas === totales.pendiente, `${dop(sumaCubetas)} vs ${dop(totales.pendiente)}`);
  const countCubetas = Object.values(antiguedad).reduce((s, b) => s + b.count, 0);
  check('cubetas cuentan el total', countCubetas === totales.count, `${countCubetas} vs ${totales.count}`);
  check('45 días cae en 31-60',  antiguedad.d31a60.count >= 1);
  check('75 días cae en 61-90',  antiguedad.d61a90.count >= 1);
  check('100 días cae en +90',   antiguedad.d90mas.count >= 1);

  console.log('\nFiltros');
  const venc  = await getCuentasPorCobrar(teamId, { limit: 2000, estado: 'vencidas' });
  const alDia = await getCuentasPorCobrar(teamId, { limit: 2000, estado: 'al-dia' });
  check('vencidas + al día == total', venc.totales.count + alDia.totales.count === totales.count);
  check('filtro vencidas solo trae vencidas', venc.cuentas.every(c => c.vencida));
  const mora = await getCuentasPorCobrar(teamId, { limit: 2000, tipoDoc: 'nota-debito' });
  check('tipoDoc=nota-debito solo trae con mora', mora.cuentas.every(c => c.moraSaldo > 0) && mora.totales.count > 0);

  console.log('\nPaginación y orden');
  const p1 = await getCuentasPorCobrar(teamId, { limit: 5, offset: 0, orden: 'antiguo' });
  const p2 = await getCuentasPorCobrar(teamId, { limit: 5, offset: 5, orden: 'antiguo' });
  check('páginas sin solape', p1.cuentas.every(c => !p2.cuentas.some(d => d.id === c.id)));
  check('totales no dependen de la página', p1.totales.pendiente === totales.pendiente);
  const porMonto = await getCuentasPorCobrar(teamId, { limit: 2000, orden: 'monto' });
  check('orden por monto descendente',
    porMonto.cuentas.every((c, i, a) => i === 0 || a[i - 1].saldo >= c.saldo));
  const porVenc = await getCuentasPorCobrar(teamId, { limit: 2000, orden: 'vencimiento' });
  const corte = porVenc.cuentas.findIndex(c => !c.vencida);
  check('orden por vencimiento agrupa vencidas al inicio',
    corte === -1 || porVenc.cuentas.slice(corte).every(c => !c.vencida));

  console.log('\nTrazabilidad del detalle');
  const det = await getDetalleCuenta(teamId, g('CONMORA')!.id);
  check('el timeline explica el saldo (emisión + mora)', det.timeline.length === 2);
  check('la mora anulada no está en el detalle', det.notasMora.length === 1);
  const detNc = await getDetalleCuenta(teamId, g('CONNCID')!.id);
  check('la NC aplicada aparece con signo negativo',
    detNc.timeline.some(e => e.tipo === 'nota-credito' && e.montoCents === -300_00));
  const detPar = await getDetalleCuenta(teamId, g('PARCIAL')!.id);
  check('el pago aparece con su método y signo negativo',
    detPar.pagos.length === 1 && detPar.pagos[0].metodo === 'efectivo'
    && detPar.timeline.some(e => e.tipo === 'pago' && e.montoCents === -400_00));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${ok} correctos, ${fail} fallidos\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('\n❌ FALLÓ:', e); process.exit(1); });
