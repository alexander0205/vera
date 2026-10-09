import { describe, it, expect } from 'vitest';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const NOV = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
const Q1 = periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!;
const Q2 = periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!;

const emp = (id: number, salario: number, estado = 'activo'): EmpleadoParaCorrida => ({
  id, nombres: `Emp${id}`, apellidos: 'Prueba', cedula: null, cargo: null,
  salarioBaseCents: salario, estado,
});

describe('construirCorrida', () => {
  it('excluye a los inactivos', () => {
    const { lineas } = construirCorrida(
      [emp(1, 3_000_000), emp(2, 3_000_000, 'inactivo')],
      TASAS_NOMINA_2026,
      NOV,
    );
    expect(lineas).toHaveLength(1);
    expect(lineas[0].empleadoId).toBe(1);
  });

  it('los totales son la suma de las líneas', () => {
    const empleados = [emp(1, 3_000_000), emp(2, 5_000_000)];
    const { lineas, totales } = construirCorrida(empleados, TASAS_NOMINA_2026, NOV);
    const d1 = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026 });
    const d2 = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026 });

    expect(lineas).toHaveLength(2);
    expect(totales.totalBrutoCents).toBe(d1.brutoCents + d2.brutoCents);
    expect(totales.totalNetoCents).toBe(d1.netoCents + d2.netoCents);
    expect(totales.totalPatronalCents).toBe(d1.totalPatronalCents + d2.totalPatronalCents);
    // El asiento cuadra: bruto + patronal (debe) = deducciones + patronal + neto (haber)
    const debe = totales.totalBrutoCents + totales.totalPatronalCents;
    const haber = totales.totalDeduccionesCents + totales.totalPatronalCents + totales.totalNetoCents;
    expect(debe).toBe(haber);
  });

  it('corrida sin activos → sin líneas ni totales', () => {
    const { lineas, totales } = construirCorrida([emp(1, 3_000_000, 'inactivo')], TASAS_NOMINA_2026, NOV);
    expect(lineas).toHaveLength(0);
    expect(totales.totalNetoCents).toBe(0);
  });
});

describe('construirCorrida con ajustes de la empresa', () => {
  const ajustes = { pisoCotizableCents: 1_842_120, srlTasa: 0.012, capitaDependienteCents: 191_978 };

  it('aplica el piso del mínimo salvo a quien tiene dispensa', () => {
    const { lineas } = construirCorrida(
      [emp(1, 1_500_000), { ...emp(2, 1_500_000), dispensaSalarioMinimo: true }],
      TASAS_NOMINA_2026, NOV, ajustes,
    );
    expect(lineas[0].salarioCotizableCents).toBe(1_842_120);
    expect(lineas[1].salarioCotizableCents).toBe(1_500_000);
    expect(lineas[0].afpEmpleadoCents).toBeGreaterThan(lineas[1].afpEmpleadoCents);
  });

  it('usa la tasa SRL de la empresa', () => {
    const { lineas } = construirCorrida([emp(1, 3_000_000)], TASAS_NOMINA_2026, NOV, ajustes);
    expect(lineas[0].srlPatronalCents).toBe(36_000); // 3,000,000 × 1.20 %
  });

  it('cobra los dependientes del empleado y el asiento sigue cuadrando', () => {
    const { lineas, totales } = construirCorrida(
      [{ ...emp(1, 5_000_000), dependientesAdicionales: 2 }, emp(2, 3_000_000)],
      TASAS_NOMINA_2026, NOV, ajustes,
    );
    expect(lineas[0].dependientesAdicionales).toBe(2);
    expect(lineas[0].dependientesAdicionalesCents).toBe(383_956);
    expect(lineas[1].dependientesAdicionalesCents).toBe(0);
    const debe = totales.totalBrutoCents + totales.totalPatronalCents;
    const haber = totales.totalDeduccionesCents + totales.totalPatronalCents + totales.totalNetoCents;
    expect(debe).toBe(haber);
  });

  it('las dos quincenas cobran entre las dos una cápita entera', () => {
    const empleados = [{ ...emp(1, 5_000_000), dependientesAdicionales: 1 }];
    const q1 = construirCorrida(empleados, TASAS_NOMINA_2026, Q1, ajustes);
    const q2 = construirCorrida(empleados, TASAS_NOMINA_2026, Q2, ajustes);
    expect(q1.lineas[0].dependientesAdicionalesCents + q2.lineas[0].dependientesAdicionalesCents).toBe(191_978);
  });
});
