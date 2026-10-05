import { describe, it, expect } from 'vitest';
import { cuadrarConComprobante, erroresCompra, resumirCompra, totalizarLineas } from '@/lib/compras/fiscal';
import { datosDesdeIa, inicialDesdeCaptura, type LecturaIa } from '@/lib/compras/captura/datos';

/**
 * El caso que destapó esto: una factura de internet de RD$1,500.01.
 *
 *   neto      1,153.85
 *   ITBIS 18 %   207.69
 *   ISC 10 %     115.39   (selectivo de telecomunicaciones)
 *   CDT 2 %       23.08   (contribución al desarrollo de las telecomunicaciones)
 *   total      1,500.01
 *
 * Con solo el ITBIS el formulario cerraba por 1,361.54 y no lo decía; quien
 * registraba intentaba meter los 346.16 de impuestos en «ITBIS llevado al
 * costo» y chocaba con una validación que no explicaba nada.
 */
const NETO = 115_385;
const ITBIS = 20_769;
const ISC = 11_539;
const CDT = 2_308;
const TOTAL_IMPRESO = 150_001;

const impuestos = (p: Partial<Parameters<typeof resumirCompra>[1]> = {}) => ({
  itbisFacturadoCents: ITBIS, itbisAlCostoCents: 0, itbisRetenidoCents: 0, isrRetenidoCents: 0,
  iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0, ...p,
});

describe('cuadre con el total impreso', () => {
  it('sin el ISC ni la contribución el registro se queda corto', () => {
    const t = totalizarLineas([{ cantidad: 1, costoUnitarioCents: NETO, itbisTasa: '0.18', esServicio: true }]);
    const resumen = resumirCompra(t.baseCents, impuestos());
    expect(resumen.totalCents).toBe(136_154);
    expect(cuadrarConComprobante(resumen.totalCents, TOTAL_IMPRESO)).toEqual({ estado: 'falta', diferenciaCents: 13_847 });
  });

  it('con cada impuesto en su campo cuadra con el papel', () => {
    const t = totalizarLineas([{ cantidad: 1, costoUnitarioCents: NETO, itbisTasa: '0.18', esServicio: true }]);
    const resumen = resumirCompra(t.baseCents, impuestos({ iscCents: ISC, otrosImpuestosCents: CDT }));
    expect(resumen.totalCents).toBe(TOTAL_IMPRESO);
    expect(cuadrarConComprobante(resumen.totalCents, TOTAL_IMPRESO).estado).toBe('cuadra');
    // El ITBIS que se adelanta sigue siendo solo el ITBIS: ni el ISC ni la CDT.
    expect(resumen.itbisPorAdelantarCents).toBe(ITBIS);
  });

  it('un peso de diferencia es redondeo del proveedor, no un error', () => {
    expect(cuadrarConComprobante(TOTAL_IMPRESO - 100, TOTAL_IMPRESO).estado).toBe('cuadra');
    expect(cuadrarConComprobante(TOTAL_IMPRESO - 101, TOTAL_IMPRESO).estado).toBe('falta');
    expect(cuadrarConComprobante(TOTAL_IMPRESO + 500, TOTAL_IMPRESO)).toEqual({ estado: 'sobra', diferenciaCents: -500 });
  });

  it('el error de ITBIS al costo dice dónde va lo que no es ITBIS', () => {
    const e = erroresCompra({
      baseCents: NETO, imp: impuestos({ itbisAlCostoCents: 34_616 }), formaPago: 'contado', fechaPago: '2026-10-05',
    }).join(' ');
    expect(e).toContain('no puede pasar de él');
    expect(e).toContain('Otros impuestos y tasas');
  });
});

describe('borrador leído de una factura con impuestos que no son ITBIS', () => {
  const lectura = (p: Partial<LecturaIa> = {}): LecturaIa => ({
    esFactura: true, clase: 'gasto', legible: true, completa: true, proveedorNombre: 'FALCO TELECOM SRL',
    nif: null, proveedorRnc: '132047907', tipoProveedor: 'juridica', resolucionDgii: null, fechaResolucionDgii: null,
    ncf: 'B0100000267', fecha: '2026-09-27', formaPago: 'contado', metodoPago: null, categoria: 'otros',
    moneda: 'DOP', subtotal: null, itbis: 207.69, isc: 115.39, otrosImpuestos: 23.08, propina: null,
    itbisRetenido: null, isrRetenido: null, totalImpreso: 'TOTAL RD$ 1,500.01', total: 1500.01, lineas: [], ...p,
  });

  it('despeja la base restando el ISC y los otros impuestos, no solo el ITBIS', () => {
    const { inicial } = inicialDesdeCaptura(datosDesdeIa(lectura(), '2026-10-05'));
    expect(inicial.lineas).toHaveLength(1);
    expect(inicial.lineas[0].costoUnitarioCents).toBe(NETO);
    // Antes salía 129,232 y el ITBIS parecía del 16 %.
    expect(inicial.lineas[0].itbisTasa).toBe('0.18');
    expect(inicial.iscCents).toBe(ISC);
    expect(inicial.otrosImpuestosCents).toBe(CDT);
    expect(inicial.montoTotalCents).toBe(TOTAL_IMPRESO);
  });

  it('lo que llega así vuelve a dar el total impreso', () => {
    const { inicial } = inicialDesdeCaptura(datosDesdeIa(lectura(), '2026-10-05'));
    const t = totalizarLineas(inicial.lineas.map((l) => ({
      cantidad: l.cantidad, costoUnitarioCents: l.costoUnitarioCents, itbisTasa: l.itbisTasa, esServicio: l.esServicio,
    })));
    const resumen = resumirCompra(t.baseCents, impuestos({
      itbisFacturadoCents: t.itbisCents,
      iscCents: inicial.iscCents ?? 0,
      otrosImpuestosCents: inicial.otrosImpuestosCents ?? 0,
    }));
    expect(cuadrarConComprobante(resumen.totalCents, inicial.montoTotalCents!).estado).toBe('cuadra');
  });
});
