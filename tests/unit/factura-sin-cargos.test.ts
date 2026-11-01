import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  comprobanteEsDeFactura, documentosDelComprobante, estaAnulada, lineasDeFactura,
  nombreDelDocumento, resumenDeFactura, seCobraComoFactura,
} from '@/lib/administracion-escolar/factura-sin-cargos';
import { repartir } from '@/lib/administracion-escolar/comprobantes';

/**
 * El enlace de una factura sin cargos decía RD$0.00 con la factura debiendo:
 * la 000978 de Mi Casita debía RD$700 y la familia no podía ni verlos ni subir
 * el comprobante.
 */
const factura = {
  facturaId: 5677,
  codigo: 'FA-000978',
  lineas: [{ concepto: 'Velada', estudiante: 'Alumno' }],
  fechaVencimiento: null,
  vencido: false,
  montoTotalCentavos: 190000,
  montoCentavos: 70000,
};
const mora = { facturaId: 99, codigo: 'ND-1', origenCodigo: 'FA-000978', montoCentavos: 50000 };

describe('cuándo se cobra la factura en vez de los cargos', () => {
  it('sin cargos y con saldo, sí', () => {
    assert.equal(seCobraComoFactura({ cargosVivos: 0, esVenta: true, saldoCentavos: 70000 }), true);
  });

  it('con cargos vivos se cobran ellos, para no cobrar dos veces', () => {
    assert.equal(seCobraComoFactura({ cargosVivos: 1, esVenta: true, saldoCentavos: 70000 }), false);
  });

  it('sin saldo no hay nada que cobrar', () => {
    assert.equal(seCobraComoFactura({ cargosVivos: 0, esVenta: true, saldoCentavos: 0 }), false);
  });

  // La NC 000058 lleva RD$1,500 de total: leída como venta, el padre la vería como deuda.
  it('una nota de crédito o una compra no se cobran', () => {
    assert.equal(seCobraComoFactura({ cargosVivos: 0, esVenta: false, saldoCentavos: 150000 }), false);
  });
});

describe('el resumen de la factura', () => {
  const abono = (montoCentavos: number, fecha = '2026-10-29') => ({ montoCentavos, metodo: 'transferencia', fecha });
  const base = {
    esVenta: true, montoTotalCentavos: 190000, abonos: [abono(120000)],
    saldoCentavos: 70000, moraCentavos: 0, totalACobrarCentavos: 70000,
  };

  it('da monto, abonado y lo que falta', () => {
    assert.deepEqual(resumenDeFactura(base), {
      montoTotalCentavos: 190000, abonadoCentavos: 120000, abonos: [abono(120000)],
      notaCreditoCentavos: 0, moraCentavos: 0,
    });
  });

  it('varios abonos se suman y se entregan uno por uno', () => {
    const abonos = [abono(100000, '2026-08-06'), abono(20000, '2026-08-25')];
    const r = resumenDeFactura({ ...base, abonos });
    assert.equal(r?.abonadoCentavos, 120000);
    assert.deepEqual(r?.abonos, abonos);
  });

  // Una nota de crédito no es dinero que la familia pagó.
  it('la nota de crédito no cuenta como abono', () => {
    const r = resumenDeFactura({ ...base, abonos: [abono(20000)], totalACobrarCentavos: 70000 });
    assert.equal(r?.abonadoCentavos, 20000);
    assert.equal(r?.notaCreditoCentavos, 100000);
  });

  it('el recargo entra en lo que se cobra', () => {
    const r = resumenDeFactura({ ...base, moraCentavos: 50000, totalACobrarCentavos: 120000 });
    assert.equal(r?.moraCentavos, 50000);
  });

  it('sin abonos también sale', () => {
    const r = resumenDeFactura({ ...base, abonos: [], saldoCentavos: 190000, totalACobrarCentavos: 190000 });
    assert.equal(r?.abonadoCentavos, 0);
    assert.equal(r?.notaCreditoCentavos, 0);
  });

  it('no enseña una resta que no da', () => {
    assert.equal(resumenDeFactura({ ...base, totalACobrarCentavos: 50000 }), null);
  });

  it('nada en una factura saldada, una nota de crédito o una compra', () => {
    assert.equal(resumenDeFactura({ ...base, saldoCentavos: 0, totalACobrarCentavos: 0 }), null);
    assert.equal(resumenDeFactura({ ...base, esVenta: false }), null);
  });
});

describe('la factura anulada', () => {
  it('se reconoce por cualquiera de los dos estados', () => {
    assert.equal(estaAnulada({ estado: 'ANULADO', estadoPago: 'ANULADA' }), true);
    assert.equal(estaAnulada({ estado: 'ANULADO', estadoPago: 'PENDIENTE' }), true);
    assert.equal(estaAnulada({ estado: 'BORRADOR', estadoPago: 'ANULADA' }), true);
  });

  // Rechazada por la DGII no es lo mismo: esa no se llama anulada.
  it('una factura viva o rechazada no lo es', () => {
    assert.equal(estaAnulada({ estado: 'BORRADOR', estadoPago: 'PARCIAL' }), false);
    assert.equal(estaAnulada({ estado: 'RECHAZADO', estadoPago: 'PENDIENTE' }), false);
  });
});

describe('las líneas de la factura', () => {
  it('saca concepto y alumno', () => {
    assert.deepEqual(
      lineasDeFactura(JSON.stringify([{ nombreItem: ' Velada ', dependienteNombre: ' Ana ' }])),
      [{ concepto: 'Velada', estudiante: 'Ana' }],
    );
  });

  it('acepta el nombre de campo viejo y la línea sin alumno', () => {
    assert.deepEqual(
      lineasDeFactura(JSON.stringify([{ nombre: 'Uniforme' }])),
      [{ concepto: 'Uniforme', estudiante: '' }],
    );
  });

  it('un JSON roto no tumba la página', () => {
    assert.deepEqual(lineasDeFactura('{no es json'), []);
    assert.deepEqual(lineasDeFactura('{"a":1}'), []);
    assert.deepEqual(lineasDeFactura(null), []);
  });
});

describe('lo que lleva el comprobante', () => {
  it('sin factura, solo las moras y sin detalle', () => {
    assert.deepEqual(
      documentosDelComprobante({ facturaSinCargos: null, moras: [mora] }),
      [mora],
    );
  });

  it('la factura va primero: una transferencia corta no paga el recargo', () => {
    const docs = documentosDelComprobante({ facturaSinCargos: factura, moras: [mora] });
    assert.deepEqual(docs.map((d) => d.facturaId), [5677, 99]);

    const r = repartir(70000, docs.map((d) => ({ facturaId: d.facturaId, saldo: d.montoCentavos })));
    assert.deepEqual(r.asignaciones, [{ facturaId: 5677, monto: 70000 }]);
    assert.equal(r.sobrante, 0);
  });

  it('dice de qué es, para que el colegio la reconozca al aprobar', () => {
    const [d] = documentosDelComprobante({ facturaSinCargos: factura, moras: [] });
    assert.equal(d.detalle, 'Velada · Alumno');
    assert.equal(nombreDelDocumento(d), 'Velada · Alumno');
  });

  it('sin líneas se nombra por la factura', () => {
    const [d] = documentosDelComprobante({
      facturaSinCargos: { ...factura, lineas: [] }, moras: [],
    });
    assert.equal(d.detalle, 'Factura FA-000978');
  });

  it('la mora se sigue llamando mora', () => {
    assert.equal(nombreDelDocumento({ origenCodigo: 'FA-1' }), 'Mora de FA-1');
    assert.equal(nombreDelDocumento({ origenCodigo: null }), 'Recargo por mora');
  });
});

describe('qué comprobantes salen en la página de una factura', () => {
  it('el que tocó uno de sus cargos', () => {
    assert.equal(comprobanteEsDeFactura({ cargos: [{ cargoId: 7 }], moras: [] }, 5677, new Set([7])), true);
  });

  // Sin esto el padre subía el comprobante y no volvía a verlo en la página.
  it('el de la factura sin cargos', () => {
    assert.equal(comprobanteEsDeFactura({ cargos: [], moras: [{ facturaId: 5677 }] }, 5677, new Set()), true);
  });

  it('no el de otra factura de la misma familia', () => {
    assert.equal(comprobanteEsDeFactura({ cargos: [{ cargoId: 8 }], moras: [{ facturaId: 1 }] }, 5677, new Set([7])), false);
  });

  it('una factura ajena no deja ver nada', () => {
    assert.equal(comprobanteEsDeFactura({ cargos: [], moras: [{ facturaId: 1 }] }, null, new Set()), false);
  });
});
