/**
 * Tests de `esVentaAsentable` — qué documento genera asiento de venta (Paso 4 +
 * nivel 2.3). La regla que blindan: una venta interna `sin-ncf` vive
 * permanentemente en BORRADOR (no va a la DGII), y AUN ASÍ debe reconocerse como
 * venta, o contabilidad asentaría su cobro sin la venta y dejaría Cuentas por
 * cobrar acreedor. Un e-CF fiscal, en cambio, solo se asienta si está en un
 * estado emitido y vivo.
 *
 * Función pura: sin DB. `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { esVentaAsentable } from '@/lib/contabilidad/asientos';

describe('esVentaAsentable — sin-ncf (venta interna)', () => {
  test('BORRADOR sin-ncf SÍ se asienta (vive así a propósito)', () => {
    assert.equal(esVentaAsentable('BORRADOR', 'sin-ncf'), true);
  });
  test('ANULADO sin-ncf NO se asienta', () => {
    assert.equal(esVentaAsentable('ANULADO', 'sin-ncf'), false);
  });
  test('RECHAZADO sin-ncf NO se asienta', () => {
    assert.equal(esVentaAsentable('RECHAZADO', 'sin-ncf'), false);
  });
});

describe('esVentaAsentable — e-CF fiscal', () => {
  test('ACEPTADO tipo 31 SÍ se asienta', () => {
    assert.equal(esVentaAsentable('ACEPTADO', '31'), true);
  });
  test('EN_PROCESO tipo 33 (mora) SÍ se asienta', () => {
    assert.equal(esVentaAsentable('EN_PROCESO', '33'), true);
  });
  test('BORRADOR fiscal NO se asienta (a diferencia de sin-ncf)', () => {
    assert.equal(esVentaAsentable('BORRADOR', '31'), false);
  });
  test('nota de crédito (34) NO entra por aquí (va por su propio generador)', () => {
    assert.equal(esVentaAsentable('ACEPTADO', '34'), false);
  });
  test('ANULADO fiscal NO se asienta', () => {
    assert.equal(esVentaAsentable('ANULADO', '31'), false);
  });
});
