/**
 * Tests del álgebra del cierre de ejercicio (Nivel 4 extra).
 *
 * `construirLineasCierre` es pura: dados los saldos de las cuentas de resultado,
 * arma las líneas que las vacían y manda el neto a 3102. Lo delicado es el signo
 * (una cuenta con saldo acreedor se cierra al debe y viceversa), que la utilidad
 * salga contra 3102 al haber y la pérdida al debe, y que el asiento SIEMPRE
 * cuadre. Nada de eso necesita base ni navegador: `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { construirLineasCierre, type SaldoResultado } from '@/lib/contabilidad/cierre';

const R3102 = 999; // id ficticio de 3102

/** neto = debe − haber; ingresos vienen negativos (acreedor), gastos positivos. */
const s = (cuentaId: number, codigo: string, netoCents: number): SaldoResultado =>
  ({ cuentaId, codigo, nombre: codigo, netoCents });

function cuadra(lineas: { debeCents: number; haberCents: number }[]): boolean {
  const d = lineas.reduce((a, l) => a + l.debeCents, 0);
  const h = lineas.reduce((a, l) => a + l.haberCents, 0);
  return d === h;
}

describe('construirLineasCierre — utilidad', () => {
  test('cierra ingresos al debe, gastos al haber, y acredita la utilidad a 3102', () => {
    // Ingresos 1000 (acreedor → neto −1000), gastos 300 (deudor → neto +300).
    const { lineas, resultadoCents } = construirLineasCierre(
      [s(41, '4101', -1000), s(61, '6101', 300)], R3102,
    );
    assert.equal(resultadoCents, 700);
    assert.ok(cuadra(lineas));
    // 4101 se cierra al debe por 1000
    assert.deepEqual(lineas.find((l) => l.cuentaId === 41), { cuentaId: 41, debeCents: 1000, haberCents: 0, descripcion: 'Cierre 4101 4101' });
    // 6101 se cierra al haber por 300
    assert.deepEqual(lineas.find((l) => l.cuentaId === 61), { cuentaId: 61, debeCents: 0, haberCents: 300, descripcion: 'Cierre 6101 6101' });
    // utilidad 700 al haber de 3102
    const r = lineas.find((l) => l.cuentaId === R3102)!;
    assert.equal(r.haberCents, 700);
    assert.equal(r.debeCents, 0);
  });
});

describe('construirLineasCierre — pérdida', () => {
  test('la pérdida va al debe de 3102 y el asiento cuadra', () => {
    // Ingresos 500, gastos 800 → pérdida 300.
    const { lineas, resultadoCents } = construirLineasCierre(
      [s(41, '4101', -500), s(61, '6101', 800)], R3102,
    );
    assert.equal(resultadoCents, -300);
    assert.ok(cuadra(lineas));
    const r = lineas.find((l) => l.cuentaId === R3102)!;
    assert.equal(r.debeCents, 300);
    assert.equal(r.haberCents, 0);
  });
});

describe('construirLineasCierre — casos borde', () => {
  test('una cuenta de contrapartida (ingreso con saldo deudor) se cierra al haber', () => {
    // 4103 Descuentos: ingreso pero saldo deudor (neto +200) → se cierra al haber.
    const { lineas } = construirLineasCierre(
      [s(41, '4101', -1000), s(43, '4103', 200), s(61, '6101', 300)], R3102,
    );
    assert.deepEqual(lineas.find((l) => l.cuentaId === 43), { cuentaId: 43, debeCents: 0, haberCents: 200, descripcion: 'Cierre 4103 4103' });
    assert.ok(cuadra(lineas));
    // utilidad = 1000 − 200(descuento) − 300(gasto) = 500
    assert.equal(lineas.find((l) => l.cuentaId === R3102)!.haberCents, 500);
  });

  test('resultado cero: no añade línea de 3102 y las de resultado ya cuadran', () => {
    const { lineas, resultadoCents } = construirLineasCierre(
      [s(41, '4101', -1000), s(61, '6101', 1000)], R3102,
    );
    assert.equal(resultadoCents, 0);
    assert.ok(cuadra(lineas));
    assert.equal(lineas.find((l) => l.cuentaId === R3102), undefined);
    assert.equal(lineas.length, 2);
  });

  test('ignora cuentas con saldo cero', () => {
    const { lineas } = construirLineasCierre(
      [s(41, '4101', -1000), s(42, '4102', 0), s(61, '6101', 1000)], R3102,
    );
    assert.equal(lineas.find((l) => l.cuentaId === 42), undefined);
  });

  test('sin cuentas de resultado, no hay líneas ni resultado', () => {
    const { lineas, resultadoCents } = construirLineasCierre([], R3102);
    assert.equal(lineas.length, 0);
    assert.equal(resultadoCents, 0);
  });
});
