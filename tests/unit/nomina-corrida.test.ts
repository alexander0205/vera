import { describe, it, expect } from 'vitest';
import { construirCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const emp = (id: number, salario: number, estado = 'activo'): EmpleadoParaCorrida => ({
  id, nombres: `Emp${id}`, apellidos: 'Prueba', cedula: null, cargo: null,
  salarioBaseCents: salario, estado,
});

describe('construirCorrida', () => {
  it('excluye a los inactivos', () => {
    const { lineas } = construirCorrida(
      [emp(1, 3_000_000), emp(2, 3_000_000, 'inactivo')],
      TASAS_NOMINA_2026,
    );
    expect(lineas).toHaveLength(1);
    expect(lineas[0].empleadoId).toBe(1);
  });

  it('los totales son la suma de las líneas', () => {
    const empleados = [emp(1, 3_000_000), emp(2, 5_000_000)];
    const { lineas, totales } = construirCorrida(empleados, TASAS_NOMINA_2026);
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
    const { lineas, totales } = construirCorrida([emp(1, 3_000_000, 'inactivo')], TASAS_NOMINA_2026);
    expect(lineas).toHaveLength(0);
    expect(totales.totalNetoCents).toBe(0);
  });
});
