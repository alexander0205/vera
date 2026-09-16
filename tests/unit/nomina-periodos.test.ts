import { describe, it, expect } from 'vitest';
import {
  construirCorrida, diasPagables, frecuenciaDeTipo, normalizarTipoCorrida, periodoDeCorrida,
  type EmpleadoParaCorrida,
} from '@/lib/nomina/corrida';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import { lunesDeLaSemana, rangoLegible, semanaDelAnio } from '@/lib/nomina/periodos';

/**
 * T1 · corridas por fechas. Los criterios de aceptación: cuatro semanales en un
 * mes, ingreso el día 20 de un mes de 30, salida el día 10, y la regalía fuera.
 */

const emp = (o: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null,
  salarioBaseCents: 3_000_000, estado: 'activo', ...o,
});

const NOV = periodoDeCorrida('mensual', { periodo: '2026-11' })!;          // 30 días
const Q1_NOV = periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!;
const Q2_NOV = periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!;

describe('periodoDeCorrida', () => {
  it('mensual y quincenas por mes, con febrero bisiesto', () => {
    expect(periodoDeCorrida('mensual', { periodo: '2028-02' })).toEqual({ tipo: 'mensual', periodo: '2028-02', inicio: '2028-02-01', fin: '2028-02-29' });
    expect(Q1_NOV).toMatchObject({ inicio: '2026-11-01', fin: '2026-11-15', periodo: '2026-11' });
    expect(Q2_NOV).toMatchObject({ inicio: '2026-11-16', fin: '2026-11-30', periodo: '2026-11' });
    expect(periodoDeCorrida('quincenal-2', { periodo: '2026-12' })).toMatchObject({ fin: '2026-12-31' });
  });

  it('la semanal paga siete días y su mes es el del último día', () => {
    expect(periodoDeCorrida('semanal', { fechaInicio: '2026-11-02' })).toEqual({ tipo: 'semanal', inicio: '2026-11-02', fin: '2026-11-08', periodo: '2026-11' });
    expect(periodoDeCorrida('semanal', { fechaInicio: '2026-10-29' })).toMatchObject({ fin: '2026-11-04', periodo: '2026-11' });
    expect(periodoDeCorrida('semanal', { fechaInicio: '2026-12-28' })).toMatchObject({ fin: '2027-01-03', periodo: '2027-01' });
  });

  it('sin dato válido no hay período', () => {
    expect(periodoDeCorrida('mensual', { periodo: '2026-13' })).toBeNull();
    expect(periodoDeCorrida('mensual', { fechaInicio: '2026-11-01' })).toBeNull();
    expect(periodoDeCorrida('semanal', { fechaInicio: '2026-02-30' })).toBeNull();
    expect(periodoDeCorrida('semanal', { periodo: '2026-11' })).toBeNull();
  });

  it('cada tipo le paga a su frecuencia', () => {
    expect(frecuenciaDeTipo('mensual')).toBe('mensual');
    expect(frecuenciaDeTipo('quincenal-1')).toBe('quincenal');
    expect(frecuenciaDeTipo('quincenal-2')).toBe('quincenal');
    expect(frecuenciaDeTipo('semanal')).toBe('semanal');
  });

  it('la regalía no corre con el motor ordinario', () => {
    expect(normalizarTipoCorrida('regalia')).toBeNull();
  });
});

describe('fechas legibles y semanas', () => {
  it('rangoLegible en largo y en corto', () => {
    expect(rangoLegible(Q1_NOV)).toBe('1 al 15 de noviembre de 2026');
    expect(rangoLegible({ inicio: '2026-10-29', fin: '2026-11-04' })).toBe('29 de octubre al 4 de noviembre de 2026');
    expect(rangoLegible({ inicio: '2026-12-28', fin: '2027-01-03' })).toBe('28 de diciembre de 2026 al 3 de enero de 2027');
    expect(rangoLegible(Q1_NOV, { corto: true })).toBe('1–15 nov 2026');
    expect(rangoLegible({ inicio: '2026-10-29', fin: '2026-11-04' }, { corto: true })).toBe('29 oct–4 nov 2026');
    expect(rangoLegible({ inicio: '2026-12-28', fin: '2027-01-03' }, { corto: true })).toBe('28 dic 2026–3 ene 2027');
  });

  it('semanaDelAnio va de 1 a 52 y el día 365 vuelve a la 1', () => {
    expect(semanaDelAnio('2026-01-01')).toBe(1);
    expect(semanaDelAnio('2026-01-07')).toBe(1);
    expect(semanaDelAnio('2026-01-08')).toBe(2);
    expect(semanaDelAnio('2026-12-30')).toBe(52);
    expect(semanaDelAnio('2026-12-31')).toBe(1);
  });

  it('lunesDeLaSemana', () => {
    expect(lunesDeLaSemana('2026-11-04')).toBe('2026-11-02');
    expect(lunesDeLaSemana('2026-11-02')).toBe('2026-11-02');
    expect(lunesDeLaSemana('2026-11-08')).toBe('2026-11-02');
  });
});

describe('días pagables', () => {
  it('cuenta el ingreso y la salida como días trabajados', () => {
    expect(diasPagables(emp({ fechaIngreso: '2026-11-20' }), NOV)).toBe(11);
    expect(diasPagables(emp({ fechaSalida: '2026-11-10', estado: 'inactivo' }), NOV)).toBe(10);
    expect(diasPagables(emp({ fechaIngreso: '2026-11-05', fechaSalida: '2026-11-06' }), NOV)).toBe(2);
  });

  it('no le paga a quien no estaba en el período ni a la baja sin fecha', () => {
    expect(diasPagables(emp({ fechaIngreso: '2026-12-01' }), NOV)).toBe(0);
    expect(diasPagables(emp({ fechaSalida: '2026-10-31', estado: 'inactivo' }), NOV)).toBe(0);
    expect(diasPagables(emp({ estado: 'inactivo' }), NOV)).toBe(0);
  });
});

describe('construirCorrida · mensual con ingreso y salida', () => {
  it('ingreso el día 20 de un mes de 30 cobra 11/30', () => {
    const { lineas } = construirCorrida([emp({ fechaIngreso: '2026-11-20' })], TASAS_NOMINA_2026, NOV);
    expect(lineas[0].brutoCents).toBe(1_100_000);
    expect(lineas[0].diasPagados).toBe(11);
    expect(lineas[0].diasPeriodo).toBe(30);
  });

  it('salida el día 10 entra con 10 días aunque ya esté inactivo', () => {
    const { lineas } = construirCorrida([emp({ fechaSalida: '2026-11-10', estado: 'inactivo' })], TASAS_NOMINA_2026, NOV);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].brutoCents).toBe(1_000_000);
    expect(lineas[0].diasPagados).toBe(10);
  });

  it('el ISR es el de lo que ganó en el mes, no un pedazo del de un mes completo', () => {
    // RD$100,000 con ingreso el 21: gana RD$33,333.33 en noviembre, exento de ISR.
    const { lineas } = construirCorrida([emp({ salarioBaseCents: 10_000_000, fechaIngreso: '2026-11-21' })], TASAS_NOMINA_2026, NOV);
    const esperado = calcularNominaEmpleado({ salarioMensualCents: 3_333_333, tasas: TASAS_NOMINA_2026 });
    expect(lineas[0].brutoCents).toBe(3_333_333);
    expect(lineas[0].isrCents).toBe(0);
    expect(lineas[0].netoCents).toBe(esperado.netoCents);
  });

  it('el piso del mínimo se prorratea por los días del mes', () => {
    const { lineas } = construirCorrida(
      [emp({ salarioBaseCents: 1_500_000, fechaIngreso: '2026-11-16' })],
      TASAS_NOMINA_2026, NOV, { pisoCotizableCents: 1_842_120 },
    );
    expect(lineas[0].brutoCents).toBe(750_000);
    expect(lineas[0].salarioCotizableCents).toBe(921_060);
  });
});

describe('construirCorrida · quincenas con ingreso y salida', () => {
  it('ingreso el 20: no entra en la 1ra y la 2da le paga 11 de 15 días', () => {
    const e = emp({ fechaIngreso: '2026-11-20' });
    expect(construirCorrida([e], TASAS_NOMINA_2026, Q1_NOV).lineas).toHaveLength(0);
    const { lineas } = construirCorrida([e], TASAS_NOMINA_2026, Q2_NOV);
    expect(lineas[0].brutoCents).toBe(1_100_000);
    expect(lineas[0].diasPagados).toBe(11);
    expect(lineas[0].diasPeriodo).toBe(15);
  });

  it('salida el 10: la 1ra paga 10 de 15 días y la 2da no la incluye', () => {
    const e = emp({ fechaSalida: '2026-11-10', estado: 'inactivo' });
    expect(construirCorrida([e], TASAS_NOMINA_2026, Q1_NOV).lineas[0].brutoCents).toBe(1_000_000);
    expect(construirCorrida([e], TASAS_NOMINA_2026, Q2_NOV).lineas).toHaveLength(0);
  });

  it('con días en las dos quincenas, suman lo mismo que la mensual', () => {
    const e = emp({ salarioBaseCents: 8_500_000, fechaIngreso: '2026-11-08' });
    const m = construirCorrida([e], TASAS_NOMINA_2026, NOV).lineas[0];
    const q1 = construirCorrida([e], TASAS_NOMINA_2026, Q1_NOV).lineas[0];
    const q2 = construirCorrida([e], TASAS_NOMINA_2026, Q2_NOV).lineas[0];
    for (const campo of ['brutoCents', 'afpEmpleadoCents', 'sfsEmpleadoCents', 'isrCents', 'netoCents', 'totalPatronalCents'] as const) {
      expect(q1[campo] + q2[campo]).toBe(m[campo]);
    }
  });
});

describe('construirCorrida · semanal', () => {
  const semanas = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']
    .map((f) => periodoDeCorrida('semanal', { fechaInicio: f })!);

  it('una semana completa vale el mes × 12 ÷ 52', () => {
    const { lineas } = construirCorrida([emp({ salarioBaseCents: 5_200_000 })], TASAS_NOMINA_2026, semanas[0]);
    expect(lineas[0].brutoCents).toBe(1_200_000); // RD$52,000 × 12 ÷ 52 = RD$12,000
    expect(lineas[0].diasPeriodo).toBe(7);
  });

  it('cuatro semanas seguidas suman mes × 12 ÷ 52 × 4 con un centavo de diferencia como mucho', () => {
    const e = emp({ salarioBaseCents: 3_000_000 });
    const suma = semanas.reduce((s, p) => s + construirCorrida([e], TASAS_NOMINA_2026, p).lineas[0].brutoCents, 0);
    expect(Math.abs(suma - (3_000_000 * 12 * 4) / 52)).toBeLessThanOrEqual(1);
  });

  it('las 52 semanas del año suman el salario anual exacto', () => {
    const e = emp({ salarioBaseCents: 3_000_000 });
    let suma = 0;
    for (let k = 0; k < 52; k++) {
      const inicio = new Date(Date.UTC(2026, 0, 1 + 7 * k)).toISOString().slice(0, 10);
      suma += construirCorrida([e], TASAS_NOMINA_2026, periodoDeCorrida('semanal', { fechaInicio: inicio })!).lineas[0].brutoCents;
    }
    expect(suma).toBe(36_000_000);
  });

  it('quien entra el jueves cobra 4 de 7 días de su primera semana', () => {
    const { lineas } = construirCorrida([emp({ salarioBaseCents: 5_200_000, fechaIngreso: '2026-06-04' })], TASAS_NOMINA_2026, semanas[0]);
    expect(lineas[0].brutoCents).toBe(685_714);
    expect(lineas[0].diasPagados).toBe(4);
  });

  it('la cápita de dependientes se lleva 12/52 por semana', () => {
    const { lineas } = construirCorrida(
      [emp({ salarioBaseCents: 5_200_000, dependientesAdicionales: 1 })],
      TASAS_NOMINA_2026, semanas[0], { capitaDependienteCents: 191_978 },
    );
    expect(lineas[0].dependientesAdicionalesCents).toBe(Math.round((191_978 * 12) / 52));
  });
});
