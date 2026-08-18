import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { repartir } from '@/lib/administracion-escolar/comprobantes';
import { generarReferencia } from '@/lib/administracion-escolar/link-pago';

/**
 * El reparto es lo único del flujo de comprobantes que mueve dinero: decide
 * contra qué factura entra cada peso que el padre transfirió. Un fallo aquí no
 * se ve —el comprobante queda aprobado igual— y aparece semanas después como
 * una familia que "pagó" y sigue debiendo.
 */
describe('repartir', () => {
  it('cubre las facturas en el orden en que vienen', () => {
    const r = repartir(5000, [
      { facturaId: 1, saldo: 3000 },
      { facturaId: 2, saldo: 4000 },
    ]);
    assert.deepEqual(r.asignaciones, [
      { facturaId: 1, monto: 3000 },
      { facturaId: 2, monto: 2000 },
    ]);
    assert.equal(r.sobrante, 0);
  });

  it('no le mete a una factura más de su saldo', () => {
    const r = repartir(9999, [{ facturaId: 1, saldo: 2500 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 1, monto: 2500 }]);
    assert.equal(r.sobrante, 7499);
  });

  /**
   * El caso que rompía el reparto ingenuo: una factura cubre varios cargos, así
   * que el mismo `facturaId` llega repetido. Si el tope se leyera por cargo, la
   * segunda vuelta creería que la factura sigue entera y `registrarPago` la
   * rechazaría por pasarse del saldo.
   */
  it('gasta el saldo de una factura repetida una sola vez', () => {
    const r = repartir(5000, [
      { facturaId: 7, saldo: 3000 },
      { facturaId: 7, saldo: 3000 },
    ]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 7, monto: 3000 }]);
    assert.equal(r.sobrante, 2000);
  });

  it('salta las facturas ya saldadas sin gastar nada', () => {
    const r = repartir(1000, [
      { facturaId: 1, saldo: 0 },
      { facturaId: 2, saldo: 800 },
    ]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 2, monto: 800 }]);
    assert.equal(r.sobrante, 200);
  });

  it('un pago parcial tapa la primera y deja la segunda intacta', () => {
    const r = repartir(1200, [
      { facturaId: 1, saldo: 3000 },
      { facturaId: 2, saldo: 3000 },
    ]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 1, monto: 1200 }]);
    assert.equal(r.sobrante, 0);
  });

  it('sin facturas devuelve todo como sobrante', () => {
    const r = repartir(4500, []);
    assert.deepEqual(r.asignaciones, []);
    assert.equal(r.sobrante, 4500);
  });

  it('trata un saldo negativo como cero', () => {
    const r = repartir(500, [{ facturaId: 1, saldo: -300 }, { facturaId: 2, saldo: 500 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 2, monto: 500 }]);
    assert.equal(r.sobrante, 0);
  });

  it('nunca reparte más de lo que llegó', () => {
    const facturas = Array.from({ length: 20 }, (_, i) => ({ facturaId: i, saldo: 10_000 }));
    const r = repartir(7777, facturas);
    const suma = r.asignaciones.reduce((a, x) => a + x.monto, 0);
    assert.equal(suma + r.sobrante, 7777);
    assert.ok(suma <= 7777);
  });
});

/**
 * La referencia la copia a mano el padre en el concepto de la transferencia, y
 * el cajero del banco la vuelve a teclear. Un cero y una O confundidos son una
 * transferencia que el colegio no puede casar con nadie.
 */
describe('generarReferencia', () => {
  it('tiene el formato ZER-XXXXXX', () => {
    assert.match(generarReferencia(), /^ZER-[A-Z2-9]{6}$/);
  });

  it('no usa caracteres que se confunden al leerlos', () => {
    const juntas = Array.from({ length: 400 }, () => generarReferencia()).join('');
    for (const c of ['I', 'O', '0', '1']) {
      assert.ok(!juntas.slice(4).includes(c), `la referencia no debería traer "${c}"`);
    }
  });

  it('no repite', () => {
    const n = 500;
    assert.equal(new Set(Array.from({ length: n }, generarReferencia)).size, n);
  });
});
