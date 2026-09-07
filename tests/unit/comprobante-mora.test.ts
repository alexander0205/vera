import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { repartir } from '@/lib/administracion-escolar/comprobantes';

/**
 * La mora entra al reparto como una factura más, al final de la cola.
 *
 * Antes no entraba de ninguna forma: el comprobante solo llevaba `cargos`, la
 * mora es una nota de débito sin cargo, y el dinero que el padre transfería por
 * ella salía como «sin aplicar». En producción eso eran RD$215,321 repartidos
 * en 124 notas que ninguna familia podía ver ni pagar.
 *
 * Lo que se prueba aquí es el ORDEN, que es la única decisión de negocio del
 * cambio: primero la colegiatura, después el recargo.
 */

/** La lista tal como la arma `planDeAplicacion`: cargos y luego moras. */
function cola(
  cargos: { facturaId: number; saldo: number }[],
  moras: { facturaId: number; saldo: number }[],
) {
  return [...cargos, ...moras];
}

describe('reparto con mora', () => {
  it('paga la colegiatura antes que el recargo', () => {
    // Transfiere 4,000: alcanza para la cuota de 3,500 y deja 500 para la mora.
    const r = repartir(400000, cola(
      [{ facturaId: 10, saldo: 350000 }],
      [{ facturaId: 99, saldo: 100000 }],
    ));
    assert.deepEqual(r.asignaciones, [
      { facturaId: 10, monto: 350000 },
      { facturaId: 99, monto: 50000 },
    ]);
    assert.equal(r.sobrante, 0);
  });

  /**
   * El caso que hace que el orden importe. Si la mora fuera primero, una
   * transferencia corta dejaría el recargo saldado y la mensualidad debiendo —
   * cobrar el interés y no el capital es lo contrario de lo que espera nadie.
   */
  it('una transferencia corta no toca el recargo', () => {
    const r = repartir(200000, cola(
      [{ facturaId: 10, saldo: 350000 }],
      [{ facturaId: 99, saldo: 100000 }],
    ));
    assert.deepEqual(r.asignaciones, [{ facturaId: 10, monto: 200000 }]);
    assert.equal(r.sobrante, 0);
  });

  it('con la colegiatura ya saldada, todo va al recargo', () => {
    const r = repartir(100000, cola(
      [{ facturaId: 10, saldo: 0 }],
      [{ facturaId: 99, saldo: 100000 }],
    ));
    assert.deepEqual(r.asignaciones, [{ facturaId: 99, monto: 100000 }]);
    assert.equal(r.sobrante, 0);
  });

  /** Cuatro meses de mora sobre la misma factura: cada nota es su documento. */
  it('reparte entre varias notas de mora, de la más vieja a la más nueva', () => {
    const r = repartir(600000, cola(
      [],
      [
        { facturaId: 91, saldo: 274040 },
        { facturaId: 92, saldo: 274040 },
        { facturaId: 93, saldo: 274040 },
      ],
    ));
    assert.deepEqual(r.asignaciones, [
      { facturaId: 91, monto: 274040 },
      { facturaId: 92, monto: 274040 },
      { facturaId: 93, monto: 51920 },
    ]);
    assert.equal(r.sobrante, 0);
  });

  /**
   * Sin cargos y sin mora no hay a dónde mandar el dinero: sale entero como
   * sobrante en vez de inventarse un destino.
   */
  it('sin nada que cobrar, el dinero queda sin aplicar', () => {
    const r = repartir(500000, cola([], []));
    assert.deepEqual(r.asignaciones, []);
    assert.equal(r.sobrante, 500000);
  });
});
