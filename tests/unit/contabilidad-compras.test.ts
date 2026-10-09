import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { distribuirCompra } from '@/lib/contabilidad/compras';

describe('distribuirCompra', () => {
  test('régimen exento capitaliza ITBIS completo en inventario', () => {
    assert.deepEqual(distribuirCompra(118_000, 18_000, 'exento'), {
      inventarioCents: 118_000,
      itbisAdelantadoCents: 0,
    });
  });

  test('régimen gravado separa el crédito fiscal sin alterar el total', () => {
    assert.deepEqual(distribuirCompra(118_000, 18_000, 'gravado'), {
      inventarioCents: 100_000,
      itbisAdelantadoCents: 18_000,
    });
  });

  test('régimen gravado sin ITBIS mantiene asiento de dos líneas', () => {
    assert.deepEqual(distribuirCompra(100_000, 0, 'gravado'), {
      inventarioCents: 100_000,
      itbisAdelantadoCents: 0,
    });
  });

  test('rechaza ITBIS mayor al total', () => {
    assert.throws(() => distribuirCompra(100, 101, 'gravado'), /ITBIS/);
  });
});
