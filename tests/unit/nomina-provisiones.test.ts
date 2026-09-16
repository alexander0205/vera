import { describe, it, expect } from 'vitest';
import {
  calcularProvisiones, provisionesDeLineas, calcularProvisionesPeriodo, diasCesantiaGanados, diasVacacionesDeLey, mesesDeServicio,
} from '@/lib/nomina/provisiones';
import { PROVISIONES_DEFAULT } from '@/lib/config/nomina-provisiones';

describe('calcularProvisiones', () => {
  it('regalía = bruto / 12', () => {
    const d = calcularProvisiones({ brutoPeriodoCents: 5_000_000 });
    expect(d.regaliaCents).toBe(Math.round(5_000_000 / 12)); // 416,667
  });

  it('vacaciones y cesantía usan el salario diario (bruto / divisor)', () => {
    const bruto = 5_000_000; // RD$50,000
    const diario = bruto / PROVISIONES_DEFAULT.divisorSalarioDiario;
    const d = calcularProvisiones({ brutoPeriodoCents: bruto });
    expect(d.vacacionesCents).toBe(Math.round((PROVISIONES_DEFAULT.diasVacaciones * diario) / 12));
    expect(d.cesantiaCents).toBe(Math.round((PROVISIONES_DEFAULT.diasCesantiaPorAnio * diario) / 12));
    expect(d.totalCents).toBe(d.regaliaCents + d.vacacionesCents + d.cesantiaCents);
  });

  it('respeta los días de vacaciones del empleado si se pasan', () => {
    const bruto = 5_000_000;
    const diario = bruto / PROVISIONES_DEFAULT.divisorSalarioDiario;
    const d = calcularProvisiones({ brutoPeriodoCents: bruto, diasVacacionesEmpleado: 18 });
    expect(d.vacacionesCents).toBe(Math.round((18 * diario) / 12));
  });

  it('bruto 0 o negativo → todo en 0', () => {
    expect(calcularProvisiones({ brutoPeriodoCents: 0 }).totalCents).toBe(0);
    expect(calcularProvisiones({ brutoPeriodoCents: -100 }).totalCents).toBe(0);
  });

  it('es lineal: dos quincenas de la mitad ≈ un mes completo (±1 centavo por redondeo)', () => {
    const mes = calcularProvisiones({ brutoPeriodoCents: 5_000_000 });
    const q1 = calcularProvisiones({ brutoPeriodoCents: 2_500_000 });
    const q2 = calcularProvisiones({ brutoPeriodoCents: 2_500_000 });
    expect(Math.abs((q1.totalCents + q2.totalCents) - mes.totalCents)).toBeLessThanOrEqual(3);
  });
});

describe('provisionesDeLineas', () => {
  it('suma las provisiones de todas las líneas', () => {
    const total = provisionesDeLineas([
      { brutoCents: 5_000_000 },
      { brutoCents: 3_000_000 },
    ]);
    const a = calcularProvisiones({ brutoPeriodoCents: 5_000_000 });
    const b = calcularProvisiones({ brutoPeriodoCents: 3_000_000 });
    expect(total.regaliaCents).toBe(a.regaliaCents + b.regaliaCents);
    expect(total.vacacionesCents).toBe(a.vacacionesCents + b.vacacionesCents);
    expect(total.cesantiaCents).toBe(a.cesantiaCents + b.cesantiaCents);
    expect(total.totalCents).toBe(a.totalCents + b.totalCents);
  });

  it('lista vacía → ceros', () => {
    expect(provisionesDeLineas([])).toEqual({ regaliaCents: 0, vacacionesCents: 0, cesantiaCents: 0, totalCents: 0 });
  });
});


/**
 * T8 · provisiones según antigüedad. Cesantía del art. 80, vacaciones del art. 177
 * y tope de regalía del art. 219. Salario de RD$30,000 → salario diario 1,258.92.
 */
describe('antigüedad y días de ley', () => {
  it('meses completos de servicio', () => {
    expect(mesesDeServicio('2026-01-10', '2026-04-09')).toBe(3);
    expect(mesesDeServicio('2026-01-10', '2026-04-08')).toBe(2);
    expect(mesesDeServicio('2026-01-31', '2026-02-28')).toBe(1);
    expect(mesesDeServicio('2026-05-01', '2026-04-30')).toBe(0);
  });

  it('cesantía ganada por tramo del art. 80', () => {
    expect(diasCesantiaGanados(2)).toBe(0);
    expect(diasCesantiaGanados(3)).toBe(6);
    expect(diasCesantiaGanados(5)).toBe(6);
    expect(diasCesantiaGanados(6)).toBe(13);
    expect(diasCesantiaGanados(11)).toBe(13);
    expect(diasCesantiaGanados(12)).toBe(21);
    expect(diasCesantiaGanados(40)).toBeCloseTo(21 * 3 + 21 * 4 / 12, 10); // 3 años y 4 meses
    expect(diasCesantiaGanados(72)).toBe(23 * 6);                          // 6 años
  });

  it('vacaciones de ley: 14 hasta 5 años, 18 desde 5', () => {
    expect(diasVacacionesDeLey(59)).toBe(14);
    expect(diasVacacionesDeLey(60)).toBe(18);
  });
});

describe('calcularProvisionesPeriodo', () => {
  const base = { brutoPeriodoCents: 3_000_000, salarioMensualCents: 3_000_000, inicio: '2026-11-01', fin: '2026-11-30' };

  it('primeros meses: no se provisiona cesantía', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: '2026-09-15' });
    expect(r.mesesServicio).toBe(2);
    expect(r.cesantiaCents).toBe(0);
    expect(r.regaliaCents).toBe(250_000);
    expect(r.diasVacacionesAnio).toBe(14);
  });

  it('el mes en que cumple 3 meses se reconocen de golpe 6 días', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: '2026-08-15' });
    expect(r.diasCesantiaAntes).toBe(0);
    expect(r.diasCesantiaDespues).toBe(6);
    expect(r.cesantiaCents).toBe(Math.round(6 * (3_000_000 / 23.83)));
  });

  it('con 2 años: 21 días al año, 1.75 días por mes', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: '2024-11-01' });
    expect(r.cesantiaCents).toBe(Math.round(1.75 * (3_000_000 / 23.83)));
    expect(r.diasVacacionesAnio).toBe(14);
  });

  it('al cumplir 5 años: 23 días por todos los años y 18 de vacaciones', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: '2021-11-01' });
    expect(r.mesesServicio).toBe(61);
    expect(r.diasVacacionesAnio).toBe(18);
    // Antes (60 meses) 23 × 5 = 115; después (61) 23 × 61/12.
    expect(r.diasCesantiaAntes).toBeCloseTo(115, 10);
    expect(r.cesantiaCents).toBe(Math.round((23 * 61 / 12 - 115) * (3_000_000 / 23.83)));
  });

  it('la ficha puede dar más vacaciones que la ley, nunca menos', () => {
    expect(calcularProvisionesPeriodo({ ...base, fechaIngreso: '2024-11-01', diasVacacionesEmpleado: 20 }).diasVacacionesAnio).toBe(20);
    expect(calcularProvisionesPeriodo({ ...base, fechaIngreso: '2020-01-01', diasVacacionesEmpleado: 14 }).diasVacacionesAnio).toBe(18);
  });

  it('regalía con tope de 5 salarios mínimos', () => {
    // RD$300,000 al mes con mínimo de RD$18,421.20: tope anual 92,106 → 7,675.50 al mes.
    const r = calcularProvisionesPeriodo({
      brutoPeriodoCents: 30_000_000, salarioMensualCents: 30_000_000, inicio: '2026-11-01', fin: '2026-11-30',
      fechaIngreso: '2020-01-01', topeRegaliaAnualCents: 5 * 1_842_120,
    });
    expect(r.regaliaTopada).toBe(true);
    expect(r.regaliaCents).toBe(767_550);
  });

  it('sin fecha de ingreso: la estimación lineal de antes', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: null });
    expect(r.cesantiaCents).toBe(Math.round(21 * (3_000_000 / 23.83) / 12));
    expect(r.mesesServicio).toBeNull();
  });

  it('quien sale dentro del período cuenta la antigüedad hasta su salida', () => {
    const r = calcularProvisionesPeriodo({ ...base, fechaIngreso: '2026-08-15', fechaSalida: '2026-11-10' });
    expect(r.mesesServicio).toBe(2);
    expect(r.cesantiaCents).toBe(0);
  });
});
