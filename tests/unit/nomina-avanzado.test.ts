import { describe, it, expect } from 'vitest';
import {
  AVANZADO_DEFAULT, completarAvanzado, costoDeUnaFaltaCents, validarAvanzado, type AvanzadoNomina,
} from '@/lib/nomina/avanzado';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { calcularLiquidacion, diasVacacionesProporcionales } from '@/lib/nomina/liquidacion';
import { calcularProvisionesPeriodo, diasVacacionesDeLey } from '@/lib/nomina/provisiones';
import { PROVISIONES_DEFAULT } from '@/lib/config/nomina-provisiones';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const NOV = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
const emp = (extra: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: 3_000_000, estado: 'activo', ...extra,
});
const con = (cambios: Partial<AvanzadoNomina>) => ({ ...AVANZADO_DEFAULT, ...cambios });

describe('valores por defecto = lo de ley de hoy', () => {
  it('coinciden con lo que traía el código', () => {
    expect(AVANZADO_DEFAULT.divisorSalarioDiario).toBe(PROVISIONES_DEFAULT.divisorSalarioDiario);
    expect(AVANZADO_DEFAULT.diasVacaciones).toBe(PROVISIONES_DEFAULT.diasVacaciones);
    expect(AVANZADO_DEFAULT.diasCesantiaProvision).toBe(PROVISIONES_DEFAULT.diasCesantiaPorAnio);
    expect(AVANZADO_DEFAULT.metodoFaltas).toBe('calendario');
    expect(AVANZADO_DEFAULT.regaliaBase).toBe('todo');
    expect(diasVacacionesDeLey(12)).toBe(14);
    expect(diasVacacionesDeLey(60)).toBe(18);
  });

  it('sin configuración la corrida, la provisión y la liquidación dan igual que con los defaults explícitos', () => {
    const ausencias = [{ inicio: '2026-11-03', fin: '2026-11-04' }];
    const sin = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, {});
    const conDef = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, { avanzado: AVANZADO_DEFAULT });
    expect(conDef.lineas[0]).toEqual(sin.lineas[0]);
    const entrada = { fechaIngreso: '2024-01-01', fechaSalida: '2026-07-01', motivo: 'desahucio' as const, salarioMensualCents: 3_000_000, regalia: null };
    expect(calcularLiquidacion({ ...entrada, divisorSalarioDiario: 23.83 })).toEqual(calcularLiquidacion(entrada));
  });
});

describe('cada valor cambia el cálculo', () => {
  it('divisor del salario diario: preaviso y cesantía', () => {
    const e = { fechaIngreso: '2024-01-01', fechaSalida: '2026-07-01', motivo: 'desahucio' as const, salarioMensualCents: 3_000_000, regalia: null };
    const a = calcularLiquidacion(e).totalCents;
    const b = calcularLiquidacion({ ...e, divisorSalarioDiario: 20 }).totalCents;
    expect(b).toBeGreaterThan(a);
  });

  it('divisor del salario diario: provisión de vacaciones', () => {
    const p = { brutoPeriodoCents: 3_000_000, salarioMensualCents: 3_000_000, fechaIngreso: '2020-01-01', inicio: '2026-11-01', fin: '2026-11-30' };
    const a = calcularProvisionesPeriodo(p).vacacionesCents;
    const b = calcularProvisionesPeriodo({ ...p, params: { ...PROVISIONES_DEFAULT, divisorSalarioDiario: 20 } }).vacacionesCents;
    expect(b).toBeGreaterThan(a);
  });

  it('método de faltas: por día laborable se descuenta más que por calendario', () => {
    const ausencias = [{ inicio: '2026-11-03', fin: '2026-11-04' }]; // 2 faltas
    const cal = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, { avanzado: con({ metodoFaltas: 'calendario' }) }).lineas[0];
    const lab = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, { avanzado: con({ metodoFaltas: 'laborable' }) }).lineas[0];
    expect(cal.brutoCents).toBe(3_000_000 - 2 * 100_000); // 2 de 30 días
    expect(lab.brutoCents).toBe(Math.round(3_000_000 - 2 * (30 / 23.83) * 100_000)); // 2 × sueldo ÷ 23.83
    expect(lab.brutoCents).toBeLessThan(cal.brutoCents);
  });

  it('método de faltas con otro divisor cambia el descuento', () => {
    const ausencias = [{ inicio: '2026-11-03', fin: '2026-11-03' }];
    const a = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, { avanzado: con({ metodoFaltas: 'laborable', divisorSalarioDiario: 23.83 }) }).lineas[0];
    const b = construirCorrida([emp({ ausencias })], TASAS_NOMINA_2026, NOV, { avanzado: con({ metodoFaltas: 'laborable', divisorSalarioDiario: 20 }) }).lineas[0];
    expect(b.brutoCents).toBeLessThan(a.brutoCents);
  });

  it('ejemplo en pantalla: 2 faltas con RD$30,000 → 2,000.00 por calendario y 2,517.84 por laborable', () => {
    expect(2 * costoDeUnaFaltaCents(3_000_000, 30, AVANZADO_DEFAULT)).toBe(200_000);
    expect(2 * costoDeUnaFaltaCents(3_000_000, 30, con({ metodoFaltas: 'laborable' }))).toBe(251_784);
  });

  it('días de vacaciones: liquidación y provisión', () => {
    expect(diasVacacionesProporcionales(24, 20, 25)).toBe(0); // 24 meses: período en curso vacío
    expect(diasVacacionesDeLey(24, 20, 25)).toBe(20);
    expect(diasVacacionesDeLey(60, 20, 25)).toBe(25);
    const p = { brutoPeriodoCents: 3_000_000, salarioMensualCents: 3_000_000, fechaIngreso: '2020-01-01', inicio: '2026-11-01', fin: '2026-11-30' };
    const a = calcularProvisionesPeriodo(p).vacacionesCents;
    const b = calcularProvisionesPeriodo({ ...p, params: { ...PROVISIONES_DEFAULT, diasVacaciones: 21, diasVacacionesMas5Anios: 21 } }).vacacionesCents;
    expect(b).toBeGreaterThan(a);
  });

  it('días de cesantía de la provisión (sin fecha de ingreso)', () => {
    const p = { brutoPeriodoCents: 3_000_000, salarioMensualCents: 3_000_000, fechaIngreso: null, inicio: '2026-11-01', fin: '2026-11-30' };
    const a = calcularProvisionesPeriodo(p).cesantiaCents;
    const b = calcularProvisionesPeriodo({ ...p, params: { ...PROVISIONES_DEFAULT, diasCesantiaPorAnio: 30 } }).cesantiaCents;
    expect(b).toBeGreaterThan(a);
  });
});

describe('validación con rangos', () => {
  it('acepta valores dentro de rango y completa lo que falta con la ley', () => {
    const v = validarAvanzado({ divisorSalarioDiario: '22,5' });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.valores.divisorSalarioDiario).toBe(22.5);
      expect(v.valores.diasVacaciones).toBe(14);
    }
  });
  it('rechaza lo que se sale de rango o de tipo', () => {
    for (const malo of [
      { divisorSalarioDiario: 19 }, { divisorSalarioDiario: 24 },
      { diasVacaciones: 13 }, { diasVacaciones: 61 }, { metodoFaltas: 'otro' }, { regaliaBase: 'nada' }, { divisorSalarioDiario: 'mucho' },
    ]) expect(validarAvanzado(malo).ok).toBe(false);
    expect(validarAvanzado(null).ok).toBe(false);
    expect(validarAvanzado([]).ok).toBe(false);
  });
  it('una fila guardada dañada vuelve a los valores de ley sin romper', () => {
    expect(completarAvanzado(null)).toEqual(AVANZADO_DEFAULT);
    expect(completarAvanzado({ divisorSalarioDiario: 999, metodoFaltas: 'x', diasVacaciones: 21 })).toEqual({ ...AVANZADO_DEFAULT, diasVacaciones: 21 });
  });
});
