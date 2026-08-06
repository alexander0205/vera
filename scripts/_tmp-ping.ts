/**
 * TEMPORAL — enciende la contabilidad del team 9 y barre los asientos.
 *   set -a; source .env.local; set +a; npx tsx scripts/_tmp-ping.ts
 */
import { guardarConfig, guardarMetodo } from '@/lib/contabilidad/config';
import { getEstadoConfiguracion, setContabilidadActiva } from '@/lib/contabilidad/validacion';

const TEAM = 9;
const USER = 4;

// ids reales del catálogo del team 9 (verificados por SQL)
const C = {
  caja: 3, bancos: 4, porCobrar: 5, itbisAdel: 6, inventario: 7, retenciones: 9,
  activoFijo: 11, deprecAcum: 12, porPagar: 15, itbis: 16, saldosFavor: 18,
  ventaMercancia: 25, servicios: 26, mora: 27, descuentos: 28,
  gastos: 34, comisiones: 35, gastoDeprec: 36,
};

async function main() {
  await guardarConfig(TEAM, {
    cuentaPorCobrarId:   C.porCobrar,
    cuentaItbisId:       C.itbis,
    cuentaIngresosId:    C.servicios,
    cuentaDescuentosId:  C.descuentos,
    cuentaMoraId:        C.mora,
    cuentaSaldosFavorId: C.saldosFavor,
    cuentaRetencionesId: C.retenciones,
    cuentaInventarioId:  C.inventario,
    cuentaPorPagarId:    C.porPagar,
    cuentaGastosId:      C.gastos,
    cuentaActivoFijoId:  C.activoFijo,
    cuentaDeprecAcumId:  C.deprecAcum,
    cuentaGastoDeprecId: C.gastoDeprec,
  }, USER);

  await guardarMetodo(TEAM, 'efectivo',      C.caja,   null, USER);
  await guardarMetodo(TEAM, 'transferencia', C.bancos, null, USER);
  await guardarMetodo(TEAM, 'tarjeta',       C.bancos, null, USER);

  const estado = await getEstadoConfiguracion(TEAM);
  console.log('huecos:', JSON.stringify(estado.huecos, null, 2));
  if (!estado.completa) { console.log('INCOMPLETA — no se activa'); process.exit(1); }

  await setContabilidadActiva(TEAM, true, USER);
  console.log('activa:', (await getEstadoConfiguracion(TEAM)).activa);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
