/**
 * Unit tests — montos rápidos del cobro POS (lib/pos/montos.ts).
 * Todo en centavos.
 */

import { describe, it, expect } from 'vitest';
import { montosRapidos } from '@/lib/pos/montos';

describe('montosRapidos', () => {
  it('RD$555.00 → exacto, 600, 1000 (como Alegra)', () => {
    expect(montosRapidos(555_00)).toEqual([555_00, 600_00, 1000_00]);
  });

  it('monto redondo a 100 no se duplica: RD$600 → 600, 1000, 1000→siguiente', () => {
    const out = montosRapidos(600_00);
    expect(out[0]).toBe(600_00);
    expect(new Set(out).size).toBe(out.length);   // sin duplicados
    expect(out).toContain(1000_00);
  });

  it('monto mayor a 1000: RD$1,250 → exacto, 1300, 1500', () => {
    expect(montosRapidos(1250_00)).toEqual([1250_00, 1300_00, 1500_00]);
  });

  it('monto exacto de billete grande: RD$1,000 → sin redondeos iguales', () => {
    const out = montosRapidos(1000_00);
    expect(out[0]).toBe(1000_00);
    expect(new Set(out).size).toBe(out.length);
  });

  it('montos chicos: RD$5 → exacto, 100, 500', () => {
    expect(montosRapidos(5_00)).toEqual([5_00, 100_00, 500_00]);
  });

  it('nunca más de 3 opciones y siempre incluye el exacto primero', () => {
    for (const total of [1_00, 99_99, 100_00, 749_50, 9999_99]) {
      const out = montosRapidos(total);
      expect(out.length).toBeLessThanOrEqual(3);
      expect(out[0]).toBe(total);
    }
  });
});
