/**
 * Defectos de la nota de débito por mora: fecha límite de crédito, condición de
 * pago, fecha de emisión desfasada y factura de origen vacía al editar.
 * Puras: sin DB ni navegador.
 */
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  DIAS_CREDITO_POR_DEFECTO, sumarDiasISO, fechaLimiteCredito,
  fechaLimiteParaEmitir, condicionPagoTexto,
} from '@/lib/facturas/fecha-limite-pago';
import { origenIdDeNota } from '@/lib/facturas/nota-origen';
import {
  fechaEmisionCalendario, fmtEmisionDocumento, fechaLargaPdf,
} from '@/lib/utils/format';

describe('fecha límite de crédito', () => {
  test('suma días cruzando mes y año', () => {
    assert.equal(sumarDiasISO('2026-11-06', 30), '2026-12-06');
    assert.equal(sumarDiasISO('2026-12-20', 15), '2027-01-04');
  });
  test('usa el plazo de la empresa; sin plazo, el de por defecto', () => {
    assert.equal(fechaLimiteCredito('2026-11-06', 15), '2026-11-21');
    assert.equal(fechaLimiteCredito('2026-11-06', null), sumarDiasISO('2026-11-06', DIAS_CREDITO_POR_DEFECTO));
    assert.equal(fechaLimiteCredito('2026-11-06', 0), sumarDiasISO('2026-11-06', DIAS_CREDITO_POR_DEFECTO));
  });
  test('crédito sin fecha límite recibe una por defecto en vez de fallar', () => {
    const f = fechaLimiteParaEmitir({ tipoPago: 2, fechaLimitePago: null, hoy: '2026-11-06', plazoPagoDefaultDias: 10 });
    assert.equal(f, '2026-11-16');
  });
  test('una fecha explícita se respeta', () => {
    const f = fechaLimiteParaEmitir({ tipoPago: 2, fechaLimitePago: '2026-12-01', hoy: '2026-11-06', plazoPagoDefaultDias: 10 });
    assert.equal(f, '2026-12-01');
  });
  test('nota de mora vieja con fecha ya pasada se renueva desde hoy; una factura normal no', () => {
    const base = { tipoPago: 2, fechaLimitePago: '2026-10-01', hoy: '2026-11-06', plazoPagoDefaultDias: 10 };
    assert.equal(fechaLimiteParaEmitir({ ...base, esNotaMora: true }), '2026-11-16');
    assert.equal(fechaLimiteParaEmitir({ ...base, esNotaMora: false }), '2026-10-01');
  });
  test('contado no lleva fecha límite', () => {
    assert.equal(fechaLimiteParaEmitir({ tipoPago: 1, fechaLimitePago: null, hoy: '2026-11-06', plazoPagoDefaultDias: 10 }), null);
  });
});

describe('condición de pago', () => {
  test('un crédito sin fecha límite ya no dice «De contado»', () => {
    assert.equal(condicionPagoTexto(2), 'Crédito');
    assert.equal(condicionPagoTexto(1), 'De contado');
    assert.equal(condicionPagoTexto(null), 'De contado');
    assert.equal(condicionPagoTexto(3), 'Gratuito');
  });
});

describe('fecha de emisión del documento', () => {
  const pura = new Date('2026-11-06T00:00:00.000Z');
  test('medianoche UTC es una fecha pura: 06/11, no 05/11 8:00 p. m.', () => {
    assert.equal(fechaEmisionCalendario(pura), '2026-11-06');
    assert.equal(fmtEmisionDocumento(pura), '06/11/2026');
    assert.equal(fmtEmisionDocumento(pura.toISOString()), '06/11/2026');
  });
  test('un instante real sigue leyéndose en hora RD', () => {
    const instante = new Date('2026-11-06T01:30:00.000Z'); // 9:30 p. m. del 05-nov en RD
    assert.equal(fechaEmisionCalendario(instante), '2026-11-05');
    assert.match(fmtEmisionDocumento(instante), /^05\/11\/2026 /);
  });
  test('el PDF usa la misma fecha', () => {
    assert.match(fechaLargaPdf(pura), /6 de noviembre de 2026/);
  });
  test('sin fecha', () => {
    assert.equal(fechaEmisionCalendario(null), null);
    assert.equal(fmtEmisionDocumento(null), '—');
  });
});

describe('factura de origen de una nota', () => {
  test('la nota por mora la tiene en mora_origen_id', () => {
    assert.equal(origenIdDeNota({ origenDocumentoId: null, moraOrigenId: 42 }), 42);
  });
  test('el vínculo manual manda; sin ninguno, null', () => {
    assert.equal(origenIdDeNota({ origenDocumentoId: 7, moraOrigenId: 42 }), 7);
    assert.equal(origenIdDeNota({}), null);
  });
});
