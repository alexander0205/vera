import { describe, it, expect } from 'vitest';
import {
  limpiarLecturaPago, proponerDesdeLectura, avisosLecturaPago, type LecturaPagoIa,
} from '@/lib/contabilidad/comprobante-pago-lectura';

const bueno = {
  esComprobante: true, monto: 4800, impuesto: 9.6, fecha: '2026-11-02',
  referencia: ' 123456 ', idTransaccion: 'TX-0009', bancoOrigen: 'Banco X', beneficiario: 'Proveedor SRL', confianza: 0.9,
};

describe('limpiarLecturaPago', () => {
  it('pasa pesos a centavos y limpia el texto', () => {
    const l = limpiarLecturaPago(bueno, 'modelo-a');
    expect(l).toMatchObject({
      esComprobante: true, montoCentavos: 480_000, impuestoCentavos: 960, fecha: '2026-11-02',
      referencia: '123456', idTransaccion: 'TX-0009', confianza: 0.9, modelo: 'modelo-a',
    });
  });

  it('no cree montos negativos, cero, absurdos ni de otro tipo', () => {
    for (const monto of [-5, 0, NaN, '4800', null, 1e12]) {
      expect(limpiarLecturaPago({ ...bueno, monto }, 'm').montoCentavos).toBeNull();
    }
  });

  it('descarta una fecha que no existe o con otro formato', () => {
    expect(limpiarLecturaPago({ ...bueno, fecha: '2026-02-30' }, 'm').fecha).toBeNull();
    expect(limpiarLecturaPago({ ...bueno, fecha: '02/11/2026' }, 'm').fecha).toBeNull();
  });

  it('si no es un comprobante, descarta todo lo «leído»', () => {
    const l = limpiarLecturaPago({ ...bueno, esComprobante: false }, 'm');
    expect(l.esComprobante).toBe(false);
    expect(l.montoCentavos).toBeNull();
    expect(l.referencia).toBeNull();
  });

  it('acota la confianza a 0–1 y tolera basura', () => {
    expect(limpiarLecturaPago({ ...bueno, confianza: 7 }, 'm').confianza).toBe(1);
    expect(limpiarLecturaPago({ ...bueno, confianza: -1 }, 'm').confianza).toBe(0);
    expect(limpiarLecturaPago(undefined, 'm').confianza).toBe(0);
    expect(limpiarLecturaPago('texto', 'm').montoCentavos).toBeNull();
  });
});

describe('proponerDesdeLectura', () => {
  it('propone monto en pesos, fecha y referencia', () => {
    expect(proponerDesdeLectura(limpiarLecturaPago(bueno, 'm'))).toEqual({
      montoDOP: '4800.00', fecha: '2026-11-02', referencia: '123456',
    });
  });

  it('usa el id de transacción cuando no hay referencia', () => {
    const l = limpiarLecturaPago({ ...bueno, referencia: null }, 'm');
    expect(proponerDesdeLectura(l).referencia).toBe('TX-0009');
  });

  it('sin lectura o con un archivo que no es comprobante no propone nada', () => {
    const vacia = { montoDOP: null, fecha: null, referencia: null };
    expect(proponerDesdeLectura(null)).toEqual(vacia);
    expect(proponerDesdeLectura(limpiarLecturaPago({ esComprobante: false }, 'm'))).toEqual(vacia);
  });
});

describe('avisosLecturaPago', () => {
  const lectura: LecturaPagoIa = limpiarLecturaPago(bueno, 'm');

  it('sin diferencias, solo avisa del impuesto que el banco cobra aparte', () => {
    const a = avisosLecturaPago(lectura, { montoCents: 480_000, fecha: '2026-11-02' });
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('cargo bancario');
  });

  it('avisa si el monto o la fecha no coinciden', () => {
    const a = avisosLecturaPago({ ...lectura, impuestoCentavos: null }, { montoCents: 500_000, fecha: '2026-11-20' });
    expect(a.some((x) => x.includes('RD$4,800.00') || x.includes('4.800,00') || x.includes('4,800'))).toBe(true);
    expect(a.some((x) => x.includes('2026-11-20'))).toBe(true);
  });

  it('tolera unos días de diferencia entre el comprobante y el pago', () => {
    const a = avisosLecturaPago({ ...lectura, impuestoCentavos: null }, { montoCents: 480_000, fecha: '2026-11-05' });
    expect(a).toEqual([]);
  });

  it('avisa de una lectura dudosa y de un archivo que no es comprobante', () => {
    expect(avisosLecturaPago({ ...lectura, impuestoCentavos: null, confianza: 0.2 }, { montoCents: 480_000, fecha: '2026-11-02' }).join(' ')).toContain('dudosa');
    expect(avisosLecturaPago(limpiarLecturaPago({ esComprobante: false }, 'm'), { montoCents: 1, fecha: '2026-11-02' })[0]).toContain('no parece');
    expect(avisosLecturaPago(null, { montoCents: 1, fecha: '2026-11-02' })).toEqual([]);
  });
});
