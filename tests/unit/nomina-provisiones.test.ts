import { describe, it, expect } from 'vitest';
import { calcularProvisiones, provisionesDeLineas } from '@/lib/nomina/provisiones';
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
