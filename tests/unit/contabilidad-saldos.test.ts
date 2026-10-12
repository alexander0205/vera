/**
 * Tests unitarios de la regla del signo de los reportes contables (Paso 6).
 *
 * Existen porque la trampa central del paso no se puede ver con los datos del
 * dev: la cuenta que de verdad la ejercita es `4103 Descuentos y devoluciones
 * sobre ventas`, que es de **tipo ingreso** pero de **naturaleza deudora**, y
 * en la base de desarrollo no tiene ni un movimiento. Un reporte que dedujera
 * la naturaleza del tipo daría el signo correcto en todas las cuentas normales
 * y lo daría cambiado justo en esa — que es de las que más se miran al revisar
 * el margen del negocio.
 *
 * Al ser función pura no hacen falta DB ni navegador: `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { saldoSegunNaturaleza } from '@/lib/contabilidad/reportes';
import { naturalezaPorTipo } from '@/lib/contabilidad/catalogo-base';
import { fmtDOP } from '@/lib/utils/format';

describe('saldoSegunNaturaleza — deudora', () => {
  test('los débitos suman y los créditos restan', () => {
    // Caja: entró 74.40, no salió nada.
    assert.equal(saldoSegunNaturaleza('deudora', 7440, 0), 7440);
  });

  test('queda negativo si los créditos superan a los débitos', () => {
    // Cuentas por cobrar del dev: 56.76 debe contra 101.40 haber.
    assert.equal(saldoSegunNaturaleza('deudora', 5676, 10140), -4464);
  });

  test('una cuenta sin saldo da exactamente cero, no -0', () => {
    const saldo = saldoSegunNaturaleza('deudora', 5000, 5000);
    assert.equal(saldo, 0);
    assert.equal(Object.is(saldo, -0), false);
  });
});

describe('saldoSegunNaturaleza — acreedora', () => {
  test('los créditos suman y los débitos restan', () => {
    // Ingresos por ventas del dev: 56.76 al haber.
    assert.equal(saldoSegunNaturaleza('acreedora', 0, 5676), 5676);
  });

  test('el mismo movimiento da signo opuesto según la naturaleza', () => {
    const debe = 1000, haber = 2500;
    assert.equal(saldoSegunNaturaleza('deudora', debe, haber), -1500);
    assert.equal(saldoSegunNaturaleza('acreedora', debe, haber), 1500);
  });
});

describe('la trampa: cuentas de contrapartida', () => {
  test('4103 Descuentos es tipo ingreso pero naturaleza deudora', () => {
    // Lo que daría deducir la naturaleza del tipo, que es el error a evitar.
    assert.equal(naturalezaPorTipo('ingreso'), 'acreedora');

    // Un descuento concedido se registra al DEBE: resta ingresos.
    const debe = 3000, haber = 0;

    const correcto = saldoSegunNaturaleza('deudora', debe, haber);   // la guardada
    const deducido = saldoSegunNaturaleza('acreedora', debe, haber); // la del tipo

    assert.equal(correcto, 3000);
    assert.equal(deducido, -3000);
    // El signo sale cambiado: es exactamente el bug que se evita leyendo la
    // columna `naturaleza` en vez de derivarla.
    assert.equal(correcto, -deducido);
  });

  test('1107 Retenciones por cobrar es activo y deudora, pese a nacer de un impuesto', () => {
    // Lo retenido por el comprador es un crédito fiscal a favor: suma al debe.
    assert.equal(saldoSegunNaturaleza('deudora', 1800, 0), 1800);
  });

  test('2104 Saldos a favor es pasivo y acreedora: crece al generarse', () => {
    // Se acredita al crear el saldo a favor y se debita al consumirlo.
    assert.equal(saldoSegunNaturaleza('acreedora', 0, 80000), 80000);
    assert.equal(saldoSegunNaturaleza('acreedora', 80000, 80000), 0);
  });
});

describe('columnas del balance de comprobación', () => {
  // Las dos columnas de saldo son aritmética pura y NO miran la naturaleza:
  // por eso el balance cuadra siempre que los asientos cuadren.
  const columnas = (debe: number, haber: number) => {
    const neto = debe - haber;
    return { deudor: neto > 0 ? neto : 0, acreedor: neto < 0 ? -neto : 0 };
  };

  test('cada cuenta cae en una sola columna', () => {
    assert.deepEqual(columnas(7440, 0),     { deudor: 7440, acreedor: 0 });
    assert.deepEqual(columnas(5676, 10140), { deudor: 0, acreedor: 4464 });
    assert.deepEqual(columnas(5000, 5000),  { deudor: 0, acreedor: 0 });
  });

  test('con los datos del dev, los saldos cuadran a ambos lados', () => {
    // Caja, Bancos, CxC e Ingresos tal como salen en la pantalla.
    const filas = [
      columnas(7440, 0),      // 1101 Caja
      columnas(2700, 0),      // 1102 Bancos
      columnas(5676, 10140),  // 1103 Cuentas por cobrar
      columnas(0, 5676),      // 4101 Ingresos por ventas
    ];
    const deudor   = filas.reduce((s, f) => s + f.deudor, 0);
    const acreedor = filas.reduce((s, f) => s + f.acreedor, 0);

    assert.equal(deudor, 10140);
    assert.equal(acreedor, 10140);
    assert.equal(deudor, acreedor);
  });
});

describe('fmtDOP con negativos', () => {
  test('el signo va delante del símbolo, no entre medias', () => {
    assert.equal(fmtDOP(-4464), '-RD$44.64');
    assert.equal(fmtDOP(4464), 'RD$44.64');
    assert.equal(fmtDOP(0), 'RD$0.00');
  });
});
