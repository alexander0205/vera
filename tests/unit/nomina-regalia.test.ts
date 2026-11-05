import { describe, it, expect } from 'vitest';
import { calcularRegalia, desgloseDeRegalia, fraccionDelMes, isrDeRegalia } from '@/lib/nomina/regalia';
import { lineasDevengoRegalia } from '@/lib/contabilidad/nomina-asientos';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import type { LineaAsiento } from '@/lib/contabilidad/asientos';

const SALARIO = 3_000_000; // RD$30,000
const TOPE = 5 * 1_800_000; // 5 salarios mínimos de ejemplo

const base = {
  anio: 2026, salarioMensualCents: SALARIO, fechaIngreso: null, fechaSalida: null,
  devengadoPorMes: {} as Record<string, number>, topeExentoCents: TOPE,
};

describe('regalía pascual: 1/12 de lo devengado en el año', () => {
  it('año completo sin nóminas en Zero: 12 meses de la ficha ÷ 12 = un sueldo', () => {
    const r = calcularRegalia(base);
    expect(r.regaliaCents).toBe(SALARIO);
    expect(r.mesesTrabajados).toBe(12);
    expect(r.mesesEstimados).toHaveLength(12);
    expect(r.devengadoRealCents).toBe(0);
  });

  it('usa lo devengado de las nóminas y estima solo los meses sin nómina', () => {
    const devengadoPorMes: Record<string, number> = {};
    for (let m = 7; m <= 12; m++) devengadoPorMes[`2026-${String(m).padStart(2, '0')}`] = 3_300_000; // ganó más (incentivos)
    const r = calcularRegalia({ ...base, devengadoPorMes });
    expect(r.devengadoRealCents).toBe(6 * 3_300_000);
    expect(r.devengadoEstimadoCents).toBe(6 * SALARIO);
    expect(r.mesesEstimados).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(r.regaliaCents).toBe(Math.round((6 * 3_300_000 + 6 * SALARIO) / 12));
  });

  it('ingreso a mitad de año: proporcional al tiempo trabajado', () => {
    // Entra el 1 de julio: 6 meses completos → media regalía.
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-07-01' });
    expect(r.mesesTrabajados).toBe(6);
    expect(r.regaliaCents).toBe(SALARIO / 2);
  });

  it('ingreso a mitad de mes cuenta la fracción de ese mes por días', () => {
    // Entra el 16 de julio (16 de 31 días) + agosto a diciembre.
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-07-16' });
    const esperado = Math.round((SALARIO * (16 / 31) + 5 * SALARIO) / 12);
    expect(r.regaliaCents).toBe(esperado);
    expect(r.mesesTrabajados).toBeCloseTo(16 / 31 + 5, 1);
  });

  it('salida a mitad de año: solo cuenta hasta la fecha de salida', () => {
    // Sale el 30 de junio: 6 meses.
    const r = calcularRegalia({ ...base, fechaSalida: '2026-06-30' });
    expect(r.mesesTrabajados).toBe(6);
    expect(r.regaliaCents).toBe(SALARIO / 2);
  });

  it('ingreso y salida en el mismo año', () => {
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-03-01', fechaSalida: '2026-08-31' });
    expect(r.mesesTrabajados).toBe(6);
    expect(r.regaliaCents).toBe(SALARIO / 2);
  });

  it('quien no trabajó ese año no cobra regalía', () => {
    expect(calcularRegalia({ ...base, fechaIngreso: '2027-01-01' }).regaliaCents).toBe(0);
    expect(calcularRegalia({ ...base, fechaSalida: '2025-12-31' }).regaliaCents).toBe(0);
  });

  it('la fracción de un mes no pasa de 1 ni baja de 0', () => {
    expect(fraccionDelMes(2026, '02', null, null)).toBe(1);
    expect(fraccionDelMes(2026, '02', '2026-03-01', null)).toBe(0);
    expect(fraccionDelMes(2026, '02', null, '2026-01-31')).toBe(0);
  });

  it('exenta hasta el tope; el resto es gravado', () => {
    const alto = calcularRegalia({ ...base, salarioMensualCents: 20_000_000 }); // RD$200,000
    expect(alto.regaliaCents).toBe(20_000_000);
    expect(alto.exentoCents).toBe(TOPE);
    expect(alto.gravadoCents).toBe(20_000_000 - TOPE);
    const normal = calcularRegalia(base);
    expect(normal.gravadoCents).toBe(0);
  });

  it('sin tope conocido, todo se trata como exento (y la capa de BD lo avisa)', () => {
    const r = calcularRegalia({ ...base, salarioMensualCents: 20_000_000, topeExentoCents: null });
    expect(r.gravadoCents).toBe(0);
  });
});

describe('ISR de la regalía y su línea de nómina', () => {
  const escala = TASAS_NOMINA_2026.isrEscala;

  it('sin parte gravada, cero ISR', () => {
    expect(isrDeRegalia(0, 5_000_000, escala)).toBe(0);
  });

  it('lo gravado paga el impuesto marginal de la renta del año', () => {
    // Base mensual de RD$100,000: renta anual 1.2M; la regalía gravada cae en un tramo que paga.
    const isr = isrDeRegalia(5_000_000, 10_000_000, escala);
    expect(isr).toBeGreaterThan(0);
    expect(isr).toBeLessThanOrEqual(5_000_000);
  });

  it('el desglose de la regalía no lleva TSS ni aportes patronales', () => {
    const d = desgloseDeRegalia(3_000_000, 100_000);
    expect(d.afpEmpleadoCents).toBe(0);
    expect(d.sfsEmpleadoCents).toBe(0);
    expect(d.totalPatronalCents).toBe(0);
    expect(d.salarioCotizableCents).toBe(0);
    expect(d.netoCents).toBe(3_000_000 - 100_000);
    expect(d.brutoCents).toBe(d.netoCents + d.totalDeduccionesCents);
  });

  it('el ISR nunca pasa de la regalía', () => {
    expect(desgloseDeRegalia(50_000, 90_000).netoCents).toBe(0);
  });
});

const debe = (ls: LineaAsiento[]) => ls.reduce((s, l) => s + l.debeCents, 0);
const haber = (ls: LineaAsiento[]) => ls.reduce((s, l) => s + l.haberCents, 0);
const CUENTAS = { gastoRegalia: 6106, regaliaPorPagar: 2110 as number | null, isr: 2108, sueldosPorPagar: 2105 };

describe('asiento de la regalía', () => {
  const s = { brutoCents: 10_000_000, reservaCents: 0, isrCents: 200_000, netoCents: 9_800_000 };

  it('con reserva suficiente consume la reserva y no toca el gasto', () => {
    const ls = lineasDevengoRegalia({ ...s, reservaCents: 12_000_000 }, CUENTAS);
    expect(debe(ls)).toBe(haber(ls));
    expect(ls.find((l) => l.cuentaId === 2110)?.debeCents).toBe(10_000_000);
    expect(ls.some((l) => l.cuentaId === 6106)).toBe(false);
  });

  it('con reserva parcial, el resto va al gasto y cuadra', () => {
    const ls = lineasDevengoRegalia({ ...s, reservaCents: 4_000_000 }, CUENTAS);
    expect(debe(ls)).toBe(haber(ls));
    expect(ls.find((l) => l.cuentaId === 2110)?.debeCents).toBe(4_000_000);
    expect(ls.find((l) => l.cuentaId === 6106)?.debeCents).toBe(6_000_000);
  });

  it('sin reserva (la empresa no provisiona), todo al gasto', () => {
    const ls = lineasDevengoRegalia(s, { ...CUENTAS, regaliaPorPagar: null });
    expect(debe(ls)).toBe(haber(ls));
    expect(ls.find((l) => l.cuentaId === 6106)?.debeCents).toBe(10_000_000);
  });

  it('no consume más reserva que el bruto', () => {
    const ls = lineasDevengoRegalia({ ...s, reservaCents: 99_000_000 }, CUENTAS);
    expect(ls.find((l) => l.cuentaId === 2110)?.debeCents).toBe(10_000_000);
    expect(debe(ls)).toBe(haber(ls));
  });
});
