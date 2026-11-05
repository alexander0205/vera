import { describe, it, expect } from 'vitest';
import { calcularRegalia, fraccionDelMes } from '@/lib/nomina/regalia';

describe('regalía de quien salió y reingresó el mismo año (los días del hueco no cuentan)', () => {
  const hueco = { desde: '2037-07-01', hasta: '2037-08-31' };

  it('fracción de un mes dentro del hueco es 0 y fuera es completa', () => {
    expect(fraccionDelMes(2037, '07', '2020-01-01', null, [hueco])).toBe(0);
    expect(fraccionDelMes(2037, '08', '2020-01-01', null, [hueco])).toBe(0);
    expect(fraccionDelMes(2037, '06', '2020-01-01', null, [hueco])).toBe(1);
    expect(fraccionDelMes(2037, '09', '2020-01-01', null, [hueco])).toBe(1);
  });

  it('un hueco que cubre parte de un mes resta solo esos días', () => {
    expect(fraccionDelMes(2037, '07', null, null, [{ desde: '2037-07-16', hasta: '2037-07-31' }])).toBeCloseTo(15 / 31, 6);
  });

  it('el año vale 10 meses (6 antes de la salida y 4 después del reingreso), no 4', () => {
    const r = calcularRegalia({
      anio: 2037, salarioMensualCents: 3_000_000, fechaIngreso: '2020-01-01', fechaSalida: null,
      huecos: [hueco], devengadoPorMes: {}, topeExentoCents: null,
    });
    expect(r.regaliaCents).toBe(2_500_000);
    // Con solo el reingreso como ingreso (el cálculo anterior) saldrían 4 meses.
    const solo = calcularRegalia({ anio: 2037, salarioMensualCents: 3_000_000, fechaIngreso: '2037-09-01', fechaSalida: null, devengadoPorMes: {}, topeExentoCents: null });
    expect(solo.regaliaCents).toBe(1_000_000);
  });
});
