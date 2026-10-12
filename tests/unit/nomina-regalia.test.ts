import { describe, it, expect } from 'vitest';
import { calcularRegalia, desgloseDeRegalia, fraccionDelMes, isrDeRegalia } from '@/lib/nomina/regalia';
import { isrAnualCents, isrMensualCents } from '@/lib/nomina/calculo';
import { lineasDevengoRegalia } from '@/lib/contabilidad/nomina-asientos';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const base = { anio: 2026, salarioMensualCents: 3_000_000, fechaIngreso: null, fechaSalida: null, topeExentoCents: null };
const todosLosMeses = (cents: number) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, '0')}`, cents]));

describe('fraccionDelMes', () => {
  it('mes completo, entrada y salida a mitad de mes, y fuera del mes', () => {
    expect(fraccionDelMes(2026, '03', null, null)).toBe(1);
    expect(fraccionDelMes(2026, '04', '2026-04-16', null)).toBeCloseTo(15 / 30, 5);
    expect(fraccionDelMes(2026, '04', null, '2026-04-15')).toBeCloseTo(15 / 30, 5);
    expect(fraccionDelMes(2026, '02', '2026-03-01', null)).toBe(0);
    expect(fraccionDelMes(2026, '05', null, '2026-04-30')).toBe(0);
    expect(fraccionDelMes(2026, '06', '2026-06-10', '2026-06-10')).toBeCloseTo(1 / 30, 5);
  });
});

describe('calcularRegalia', () => {
  it('un año completo con nómina: 1/12 de lo devengado', () => {
    const r = calcularRegalia({ ...base, devengadoPorMes: todosLosMeses(3_000_000) });
    expect(r.regaliaCents).toBe(3_000_000);
    expect(r.devengadoRealCents).toBe(36_000_000);
    expect(r.devengadoEstimadoCents).toBe(0);
    expect(r.mesesEstimados).toEqual([]);
    expect(r.mesesTrabajados).toBe(12);
  });

  it('usa lo realmente devengado, incentivos y horas incluidos, no el salario de la ficha', () => {
    const r = calcularRegalia({ ...base, devengadoPorMes: { ...todosLosMeses(3_000_000), '2026-06': 4_200_000 } });
    expect(r.devengadoRealCents).toBe(11 * 3_000_000 + 4_200_000);
    expect(r.regaliaCents).toBe(Math.round((11 * 3_000_000 + 4_200_000) / 12));
  });

  it('los meses sin nómina en Zero se estiman con la ficha y se avisan', () => {
    const r = calcularRegalia({ ...base, devengadoPorMes: { '2026-10': 3_000_000, '2026-11': 3_000_000, '2026-12': 3_000_000 } });
    expect(r.mesesEstimados).toHaveLength(9);
    expect(r.mesesEstimados[0]).toBe('2026-01');
    expect(r.devengadoEstimadoCents).toBe(9 * 3_000_000);
    expect(r.regaliaCents).toBe(3_000_000);
  });

  it('quien entró a mitad de año cobra proporcional', () => {
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-07-01', devengadoPorMes: {} });
    expect(r.mesesTrabajados).toBe(6);
    expect(r.regaliaCents).toBe(Math.round((6 * 3_000_000) / 12));
  });

  it('quien salió cobra hasta su último día', () => {
    const r = calcularRegalia({ ...base, fechaSalida: '2026-03-31', devengadoPorMes: {} });
    expect(r.mesesTrabajados).toBe(3);
    expect(r.regaliaCents).toBe(750_000);
  });

  it('quien entró y salió dentro del mismo mes cobra esos días', () => {
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-04-10', fechaSalida: '2026-04-19', devengadoPorMes: {} });
    expect(r.regaliaCents).toBe(Math.round((3_000_000 * (10 / 30)) / 12));
  });

  it('nadie que no trabajó en el año ni salario cero genera regalía', () => {
    expect(calcularRegalia({ ...base, fechaIngreso: '2027-01-01', devengadoPorMes: {} }).regaliaCents).toBe(0);
    expect(calcularRegalia({ ...base, fechaSalida: '2025-12-31', devengadoPorMes: {} }).regaliaCents).toBe(0);
    expect(calcularRegalia({ ...base, salarioMensualCents: 0, devengadoPorMes: {} }).regaliaCents).toBe(0);
  });

  it('el tope de 5 salarios mínimos parte la regalía en exenta y gravada', () => {
    const r = calcularRegalia({ ...base, salarioMensualCents: 20_000_000, devengadoPorMes: {}, topeExentoCents: 8_000_000 });
    expect(r.regaliaCents).toBe(20_000_000);
    expect(r.exentoCents).toBe(8_000_000);
    expect(r.gravadoCents).toBe(12_000_000);
    expect(r.exentoCents + r.gravadoCents).toBe(r.regaliaCents);
  });

  it('sin tope conocido todo es exento; con regalía menor que el tope, nada se grava', () => {
    expect(calcularRegalia({ ...base, devengadoPorMes: {}, topeExentoCents: null }).gravadoCents).toBe(0);
    expect(calcularRegalia({ ...base, devengadoPorMes: {}, topeExentoCents: 50_000_000 }).gravadoCents).toBe(0);
  });

  it('un mes con nómina por una fracción del mes cuenta como mes trabajado', () => {
    const r = calcularRegalia({ ...base, fechaIngreso: '2026-12-16', devengadoPorMes: { '2026-12': 1_500_000 } });
    expect(r.devengadoRealCents).toBe(1_500_000);
    expect(r.regaliaCents).toBe(125_000);
  });
});

describe('ISR de la regalía', () => {
  const escala = TASAS_NOMINA_2026.isrEscala;

  it('isrMensualCents sigue dando lo mismo tras separar la escala anual', () => {
    for (const mensual of [0, 10_000_00, 4_000_000, 8_000_000, 20_000_000, 50_000_000]) {
      expect(isrMensualCents(mensual, escala)).toBe(Math.round(isrAnualCents(mensual * 12, escala) / 12));
    }
    expect(isrAnualCents(-5, escala)).toBe(0);
  });

  it('sin gravado no hay ISR', () => {
    expect(isrDeRegalia(0, 5_000_000, escala)).toBe(0);
    expect(isrDeRegalia(-100, 5_000_000, escala)).toBe(0);
  });

  it('es la diferencia del impuesto anual con y sin lo gravado, nunca negativa', () => {
    const base = 5_000_000;
    const g = 10_000_000;
    const esperado = Math.round(isrAnualCents(base * 12 + g, escala) - isrAnualCents(base * 12, escala));
    expect(isrDeRegalia(g, base, escala)).toBe(esperado);
    expect(isrDeRegalia(g, base, escala)).toBeGreaterThanOrEqual(0);
    expect(isrDeRegalia(g, base, escala)).toBeLessThan(g);
  });

  it('una regalía gravada se grava menos que si fuera un sueldo mensual repetido', () => {
    const g = 10_000_000;
    expect(isrDeRegalia(g, 5_000_000, escala)).toBeLessThan(isrMensualCents(5_000_000 + g, escala) - isrMensualCents(5_000_000, escala));
  });
});

describe('desgloseDeRegalia y asiento', () => {
  it('solo ISR: sin TSS ni aportes, y el neto es bruto menos ISR', () => {
    const d = desgloseDeRegalia(3_000_000, 250_000);
    expect(d).toMatchObject({ brutoCents: 3_000_000, isrCents: 250_000, netoCents: 2_750_000, totalDeduccionesCents: 250_000, totalPatronalCents: 0, afpEmpleadoCents: 0, sfsEmpleadoCents: 0 });
  });
  it('el ISR nunca pasa de la regalía', () => {
    expect(desgloseDeRegalia(1_000, 5_000).netoCents).toBe(0);
  });

  const C = { gastoRegalia: 6106, regaliaPorPagar: 2110, isr: 2108, sueldosPorPagar: 2105 };
  const debe = (ls: { debeCents: number }[]) => ls.reduce((s, l) => s + l.debeCents, 0);
  const haber = (ls: { haberCents: number }[]) => ls.reduce((s, l) => s + l.haberCents, 0);
  const saldo = (ls: { cuentaId: number; debeCents: number; haberCents: number }[], c: number) => ls.filter((l) => l.cuentaId === c).reduce((s, l) => s + l.debeCents - l.haberCents, 0);

  it('con reserva suficiente consume el pasivo y no toca el gasto', () => {
    const ls = lineasDevengoRegalia({ brutoCents: 3_000_000, reservaCents: 3_000_000, isrCents: 100_000, netoCents: 2_900_000 }, C);
    expect(debe(ls)).toBe(haber(ls));
    expect(saldo(ls, 2110)).toBe(3_000_000);
    expect(ls.find((l) => l.cuentaId === 6106)).toBeUndefined();
    expect(saldo(ls, 2108)).toBe(-100_000);
    expect(saldo(ls, 2105)).toBe(-2_900_000);
  });
  it('con reserva parcial, el resto va al gasto', () => {
    const ls = lineasDevengoRegalia({ brutoCents: 3_000_000, reservaCents: 1_000_000, isrCents: 0, netoCents: 3_000_000 }, C);
    expect(debe(ls)).toBe(haber(ls));
    expect(saldo(ls, 2110)).toBe(1_000_000);
    expect(saldo(ls, 6106)).toBe(2_000_000);
  });
  it('con más reserva que regalía solo usa lo que paga', () => {
    const ls = lineasDevengoRegalia({ brutoCents: 1_000_000, reservaCents: 9_000_000, isrCents: 0, netoCents: 1_000_000 }, C);
    expect(saldo(ls, 2110)).toBe(1_000_000);
    expect(debe(ls)).toBe(haber(ls));
  });
  it('sin cuenta de reserva o sin reserva todo es gasto', () => {
    for (const [reserva, cuenta] of [[0, 2110], [5_000_000, null]] as const) {
      const ls = lineasDevengoRegalia({ brutoCents: 2_000_000, reservaCents: reserva, isrCents: 50_000, netoCents: 1_950_000 }, { ...C, regaliaPorPagar: cuenta });
      expect(debe(ls)).toBe(haber(ls));
      expect(saldo(ls, 6106)).toBe(2_000_000);
      expect(ls.find((l) => l.cuentaId === 2110)).toBeUndefined();
    }
  });
});
