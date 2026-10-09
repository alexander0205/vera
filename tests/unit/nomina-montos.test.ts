import { describe, it, expect } from 'vitest';
import { pesosACentavos } from '@/lib/nomina/montos';

describe('pesosACentavos', () => {
  it('acepta los montos como se escriben en RD', () => {
    expect(pesosACentavos('35000')).toBe(3_500_000);
    expect(pesosACentavos('35,000')).toBe(3_500_000);
    expect(pesosACentavos('35,000.50')).toBe(3_500_050);
    expect(pesosACentavos('RD$ 35,000')).toBe(3_500_000);
    expect(pesosACentavos(' 1,234,567.89 ')).toBe(123_456_789);
    expect(pesosACentavos('0')).toBe(0);
    expect(pesosACentavos(35000)).toBe(3_500_000);
  });

  it('rechaza lo que no es un monto en vez de volverlo cero', () => {
    expect(pesosACentavos('1000-')).toBeNull();
    expect(pesosACentavos('35.000,50')).toBeNull();
    expect(pesosACentavos('12,34')).toBeNull();
    expect(pesosACentavos('1.234')).toBeNull();
    expect(pesosACentavos('-500')).toBeNull();
    expect(pesosACentavos('abc')).toBeNull();
    expect(pesosACentavos('')).toBeNull();
    expect(pesosACentavos(Number.NaN)).toBeNull();
  });
});
