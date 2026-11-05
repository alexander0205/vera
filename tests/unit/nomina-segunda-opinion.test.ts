import { describe, it, expect } from 'vitest';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { calcularRegalia } from '@/lib/nomina/regalia';
import { diasCesantiaLey } from '@/lib/nomina/provisiones';
import { calcularLiquidacion, diasVacacionesProporcionales, disponibleParaDeudas, promedioUltimosMeses, regaliaNetaDeLoPagado } from '@/lib/nomina/liquidacion';
import { AVANZADO_DEFAULT, validarAvanzado, topeRegaliaCents, type AvanzadoNomina } from '@/lib/nomina/avanzado';
import { CONCEPTOS_SEMILLA, type ConceptoAplicable } from '@/lib/nomina/conceptos';
import { HORARIO_LUNES_A_VIERNES, HORARIO_LUNES_A_SABADO } from '@/lib/nomina/jornada';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const emp = (salario: number, extra: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: salario, estado: 'activo', ...extra,
});
const incentivo = (montoCents: number): ConceptoAplicable =>
  ({ conceptoId: 1, tipo: 'ingreso', nombre: 'Incentivo', montoCents, cotizaTss: true, gravaIsr: true });

/** ISR que la línea retiene de más por causa de los conceptos. */
const isrDelConcepto = (tipo: 'mensual' | 'quincenal-1' | 'quincenal-2' | 'semanal', conceptos: ConceptoAplicable[], previos: ConceptoAplicable[] = []) => {
  const periodo = tipo === 'semanal' ? periodoDeCorrida('semanal', { fechaInicio: '2026-11-02' })! : periodoDeCorrida(tipo, { periodo: '2026-11' })!;
  const con = construirCorrida([emp(10_000_000, { conceptos, conceptosPrevios: previos })], TASAS_NOMINA_2026, periodo).lineas[0];
  const sin = construirCorrida([emp(10_000_000, { conceptosPrevios: previos })], TASAS_NOMINA_2026, periodo).lineas[0];
  return con.isrCents - sin.isrCents;
};

describe('1. el ISR de un ingreso variable se retiene completo en el período en que se paga', () => {
  it('salario 100,000 e incentivo único de 50,000: la misma retención en mensual, quincena y semana', () => {
    const mensual = isrDelConcepto('mensual', [incentivo(5_000_000)]);
    expect(mensual).toBe(1_176_125);
    expect(isrDelConcepto('quincenal-1', [incentivo(5_000_000)])).toBe(mensual);
    expect(isrDelConcepto('quincenal-2', [incentivo(5_000_000)])).toBe(mensual);
    expect(isrDelConcepto('semanal', [incentivo(5_000_000)])).toBe(mensual);
  });

  it('incentivo en las dos quincenas: la suma del mes es la del mes con ambos juntos', () => {
    const delMes = isrDelConcepto('mensual', [incentivo(10_000_000)]);
    const q1 = isrDelConcepto('quincenal-1', [incentivo(5_000_000)]);
    const q2 = isrDelConcepto('quincenal-2', [incentivo(5_000_000)], [incentivo(5_000_000)]);
    expect(Math.abs(q1 + q2 - delMes)).toBeLessThanOrEqual(1);
  });

  it('respeta el tope de la AFP: dos quincenas con el mismo incentivo retienen lo mismo que el mes junto', () => {
    const salario = 20_000_000;
    const c = [incentivo(8_000_000)];
    const q = (t: 'quincenal-1' | 'quincenal-2', extra: Partial<EmpleadoParaCorrida>) =>
      construirCorrida([emp(salario, extra)], TASAS_NOMINA_2026, periodoDeCorrida(t, { periodo: '2026-11' })!).lineas[0];
    const afpQuincenas = q('quincenal-1', { conceptos: c }).afpEmpleadoCents + q('quincenal-2', { conceptos: c, conceptosPrevios: c }).afpEmpleadoCents;
    const afpMes = construirCorrida([emp(salario, { conceptos: [incentivo(16_000_000)] })], TASAS_NOMINA_2026, periodoDeCorrida('mensual', { periodo: '2026-11' })!).lineas[0].afpEmpleadoCents;
    expect(Math.abs(afpQuincenas - afpMes)).toBeLessThanOrEqual(2);
  });

  it('el ISR de la línea nunca es negativo', () => {
    const l = construirCorrida([emp(3_750_000, { conceptos: [{ ...incentivo(3_000_000), gravaIsr: false }] })], TASAS_NOMINA_2026, periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!).lineas[0];
    expect(l.isrCents).toBeGreaterThanOrEqual(0);
  });
});

describe('3. faltas «laborable» solo cuentan los días que trabaja', () => {
  const laborable: AvanzadoNomina = { ...AVANZADO_DEFAULT, metodoFaltas: 'laborable' };
  const NOV = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
  const ausencias = [{ inicio: '2026-11-06', fin: '2026-11-09' }]; // viernes a lunes
  const costo = (horario: typeof HORARIO_LUNES_A_VIERNES | null) => {
    const base = construirCorrida([emp(3_000_000)], TASAS_NOMINA_2026, NOV, { avanzado: laborable }).lineas[0].brutoCents;
    const con = construirCorrida([emp(3_000_000, { ausencias, horarioSemanal: horario })], TASAS_NOMINA_2026, NOV, { avanzado: laborable }).lineas[0].brutoCents;
    return (base - con) / (3_000_000 / 23.83);
  };
  it('sin sábados son 2 días; con sábados, 3; sin horario, lunes a sábado (3)', () => {
    expect(costo(HORARIO_LUNES_A_VIERNES)).toBeCloseTo(2, 1);
    expect(costo(HORARIO_LUNES_A_SABADO)).toBeCloseTo(3, 1);
    expect(costo(null)).toBeCloseTo(3, 1);
  });
  it('por calendario siguen contando todos los días', () => {
    const con = construirCorrida([emp(3_000_000, { ausencias })], TASAS_NOMINA_2026, NOV).lineas[0].brutoCents;
    expect(con).toBe(3_000_000 - Math.round((3_000_000 / 30) * 4));
  });
});

describe('4. regalía de quien cobra semanal', () => {
  it('una semana aprobada de diciembre no da el mes por cubierto', () => {
    const r = calcularRegalia({
      anio: 2026, salarioMensualCents: 5_200_000, fechaIngreso: null, fechaSalida: null,
      devengadoPorMes: { '2026-12': 1_200_000 }, coberturaPorMes: { '2026-12': { q1: false, q2: false, diasSemanales: 7 } },
      topeExentoCents: null,
    });
    // Diciembre debe valer el sueldo del mes (52,000): 12,000 de la semana + 40,000 estimados.
    expect(r.devengadoRealCents + r.devengadoEstimadoCents - 11 * 5_200_000).toBe(5_200_000);
  });
  it('con todo el mes cubierto ya no estima nada', () => {
    const r = calcularRegalia({
      anio: 2026, salarioMensualCents: 5_200_000, fechaIngreso: null, fechaSalida: null,
      devengadoPorMes: { '2026-12': 5_200_000 }, coberturaPorMes: { '2026-12': { q1: false, q2: false, diasSemanales: 31 } },
      topeExentoCents: null,
    });
    expect(r.mesesEstimados).not.toContain('2026-12');
  });
});

describe('6. cesantía de la liquidación (art. 80)', () => {
  it('por tramos y fracciones', () => {
    expect(diasCesantiaLey(2)).toBe(0);
    expect(diasCesantiaLey(4)).toBe(6);
    expect(diasCesantiaLey(8)).toBe(13);
    expect(diasCesantiaLey(12)).toBe(21);
    expect(diasCesantiaLey(14)).toBe(21);
    expect(diasCesantiaLey(16)).toBe(27);
    expect(diasCesantiaLey(20)).toBe(21 + 13);
    expect(diasCesantiaLey(60)).toBe(115);
    expect(diasCesantiaLey(72)).toBe(23 * 6);
  });
  it('la liquidación usa esos días', () => {
    const r = calcularLiquidacion({ fechaIngreso: '2025-03-01', fechaSalida: '2026-07-01', motivo: 'desahucio', salarioMensualCents: 2_383_000, regalia: null });
    expect(r.componentes.find((c) => c.clave === 'cesantia')!.dias).toBe(27);
  });
  it('vacaciones proporcionales después del primer año siguen la escala del art. 180', () => {
    expect(diasVacacionesProporcionales(14)).toBe(0); // 2 meses de fracción
    expect(diasVacacionesProporcionales(17)).toBe(6); // 5 meses
    expect(diasVacacionesProporcionales(23)).toBe(12); // 11 meses
  });
});

describe('7. salario diario de la liquidación = promedio de los últimos 12 meses', () => {
  it('promedia solo los meses con nómina dentro de la ventana', () => {
    const p = promedioUltimosMeses({ '2025-05': 9_000_000, '2025-08': 3_000_000, '2025-09': 4_000_000, '2026-07': 5_000_000 }, '2026-07-15');
    expect(p).toEqual({ promedioCents: 4_000_000, meses: 3 }); // 2025-05 queda fuera de los 12 meses
  });
  it('sin nóminas devuelve null (se usa la ficha)', () => {
    expect(promedioUltimosMeses({}, '2026-07-15')).toBeNull();
  });
  it('el salario que recibe la liquidación manda sobre la ficha', () => {
    const base = { fechaIngreso: '2020-01-01', fechaSalida: '2026-07-01', motivo: 'desahucio' as const, regalia: null };
    expect(calcularLiquidacion({ ...base, salarioMensualCents: 4_000_000 }).salarioDiarioCents)
      .toBeLessThan(calcularLiquidacion({ ...base, salarioMensualCents: 5_000_000 }).salarioDiarioCents);
  });
});

describe('8. «Avanzado» solo hacia lo que da la ley o más al empleado', () => {
  it('divisor entre 20 y 23.83; vacaciones mínimo 14 y 18', () => {
    expect(validarAvanzado({ divisorSalarioDiario: 23.83 }).ok).toBe(true);
    expect(validarAvanzado({ divisorSalarioDiario: 20 }).ok).toBe(true);
    expect(validarAvanzado({ divisorSalarioDiario: 24 }).ok).toBe(false);
    expect(validarAvanzado({ divisorSalarioDiario: 30 }).ok).toBe(false);
    expect(validarAvanzado({ diasVacaciones: 13 }).ok).toBe(false);
    expect(validarAvanzado({ diasVacaciones: 15, diasVacacionesMas5Anios: 20 }).ok).toBe(true);
    expect(validarAvanzado({ diasVacacionesMas5Anios: 17 }).ok).toBe(false);
  });
  it('el tope exento de la regalía es fijo en el código: 5 salarios mínimos', () => {
    expect(topeRegaliaCents(1_800_000)).toBe(9_000_000);
    expect(Object.keys(AVANZADO_DEFAULT)).not.toContain('regaliaTopeExentoSalarios');
  });
  it('la provisión de regalía no queda limitada por ese tope', () => {
    const l = construirCorrida([emp(50_000_000)], TASAS_NOMINA_2026, periodoDeCorrida('mensual', { periodo: '2026-11' })!, { pisoCotizableCents: 1_800_000 }).lineas[0];
    expect(l.provisionRegaliaCents).toBe(Math.round(l.brutoCents / 12));
  });
});

describe('12. semillas de conceptos', () => {
  it('no hay un concepto de «vacaciones pagadas» (compensar vacaciones en dinero va contra la ley)', () => {
    expect(CONCEPTOS_SEMILLA.some((c) => /vacaciones pagadas/i.test(c.nombre))).toBe(false);
    expect(CONCEPTOS_SEMILLA.find((c) => c.codigo === 'vacaciones')?.nombre).toBe('Bono vacacional');
  });
});

describe('2. regalía ya pagada no se paga otra vez en la liquidación', () => {
  const r = { regaliaCents: 1_000_000, exentoCents: 1_000_000, gravadoCents: 0 };
  it('descuenta lo ya cobrado y nunca queda negativa', () => {
    expect(regaliaNetaDeLoPagado(r, 400_000).regaliaCents).toBe(600_000);
    expect(regaliaNetaDeLoPagado(r, 1_500_000).regaliaCents).toBe(0);
    expect(regaliaNetaDeLoPagado(r, 0)).toEqual(r);
  });
});

describe('5. el préstamo no se descuenta de la regalía (art. 222)', () => {
  it('solo se puede descontar del neto sin la regalía', () => {
    // Neto 150,000; regalía 40,000 con 1,000 de ISR: se pueden descontar hasta 111,000.
    expect(disponibleParaDeudas(15_000_000, 4_000_000, 100_000)).toBe(11_100_000);
    // Liquidación que es solo regalía: no hay nada que descontar.
    expect(disponibleParaDeudas(3_900_000, 4_000_000, 100_000)).toBe(0);
    expect(disponibleParaDeudas(5_000_000, 0, 0)).toBe(5_000_000);
  });
});
