import { describe, it, expect } from 'vitest';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import {
  aplicaEnCorrida, aplicarConceptos, cuotaPrestamo, type ConceptoAplicable,
} from '@/lib/nomina/conceptos';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { lineasDevengoNomina, type CuentasNomina, type SumasCorrida } from '@/lib/contabilidad/nomina-asientos';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const MES = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
const Q1 = periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!;
const Q2 = periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!;

const ingreso = (montoCents: number, cotizaTss = true, cuentaId: number | null = null): ConceptoAplicable =>
  ({ conceptoId: 1, tipo: 'ingreso', nombre: 'Incentivo', montoCents, cotizaTss, cuentaId });
const descuento = (montoCents: number, extra: Partial<ConceptoAplicable> = {}): ConceptoAplicable =>
  ({ conceptoId: 2, tipo: 'descuento', nombre: 'Avance', montoCents, cotizaTss: false, ...extra });

const emp = (salario: number, conceptos?: ConceptoAplicable[]): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null,
  salarioBaseCents: salario, estado: 'activo', conceptos,
});

describe('aplicaEnCorrida', () => {
  it('fijo: cuenta mientras su vigencia se traslape con el período', () => {
    const a = { fijo: true, desde: '2026-09-01', hasta: null };
    expect(aplicaEnCorrida(a, '2026-11-01', '2026-11-30')).toBe(true);
    expect(aplicaEnCorrida({ ...a, hasta: '2026-10-31' }, '2026-11-01', '2026-11-30')).toBe(false);
    expect(aplicaEnCorrida({ ...a, desde: '2026-12-01' }, '2026-11-01', '2026-11-30')).toBe(false);
  });
  it('no fijo: solo la corrida cuyas fechas contienen su día', () => {
    const a = { fijo: false, desde: '2026-11-20', hasta: null };
    expect(aplicaEnCorrida(a, '2026-11-16', '2026-11-30')).toBe(true);
    expect(aplicaEnCorrida(a, '2026-11-01', '2026-11-15')).toBe(false);
  });
});

describe('cuotaPrestamo', () => {
  it('la cuota, o el saldo si queda menos', () => {
    expect(cuotaPrestamo({ id: 1, saldoCents: 100_000, cuotaCents: 30_000 })).toBe(30_000);
    expect(cuotaPrestamo({ id: 1, saldoCents: 12_000, cuotaCents: 30_000 })).toBe(12_000);
    expect(cuotaPrestamo({ id: 1, saldoCents: 0, cuotaCents: 30_000 })).toBe(0);
  });
});

describe('aplicarConceptos', () => {
  const salario = 5_000_000;
  const params = { salarioMensualCents: salario, tasas: TASAS_NOMINA_2026 };
  const base = calcularNominaEmpleado(params);

  it('sin conceptos no toca nada', () => {
    const r = aplicarConceptos(base, params, []);
    expect(r.desglose).toEqual(base);
  });

  it('un ingreso que cotiza equivale a pagar ese salario mayor', () => {
    const r = aplicarConceptos(base, params, [ingreso(1_000_000)]);
    const esperado = calcularNominaEmpleado({ ...params, salarioMensualCents: salario + 1_000_000 });
    expect(r.desglose).toEqual(esperado);
  });

  it('un ingreso exento solo suma al bruto y al neto', () => {
    const r = aplicarConceptos(base, params, [ingreso(500_000, false)]);
    expect(r.desglose.brutoCents).toBe(base.brutoCents + 500_000);
    expect(r.desglose.netoCents).toBe(base.netoCents + 500_000);
    expect(r.desglose.afpEmpleadoCents).toBe(base.afpEmpleadoCents);
    expect(r.desglose.isrCents).toBe(base.isrCents);
  });

  it('un descuento baja el neto y va a otras deducciones', () => {
    const r = aplicarConceptos(base, params, [descuento(200_000)]);
    expect(r.desglose.otrasDeduccionesCents).toBe(200_000);
    expect(r.desglose.netoCents).toBe(base.netoCents - 200_000);
    expect(r.desglose.brutoCents - r.desglose.totalDeduccionesCents).toBe(r.desglose.netoCents);
  });

  it('el descuento nunca deja el neto en negativo y avisa lo que no cupo', () => {
    const r = aplicarConceptos(base, params, [descuento(base.netoCents + 700_000)]);
    expect(r.desglose.netoCents).toBe(0);
    expect(r.noAplicadoCents).toBe(700_000);
    expect(r.aplicados[0].montoCents).toBe(base.netoCents);
    expect(r.aplicados[0].pedidoCents).toBe(base.netoCents + 700_000);
  });

  it('con varios descuentos, los primeros se aplican completos y el último queda corto', () => {
    const r = aplicarConceptos(base, params, [descuento(base.netoCents - 100_000), descuento(300_000)]);
    expect(r.aplicados.map((c) => c.montoCents)).toEqual([base.netoCents - 100_000, 100_000]);
    expect(r.noAplicadoCents).toBe(200_000);
  });
});

describe('construirCorrida con conceptos', () => {
  it('mensual: el neto sube por el ingreso y baja por el descuento, y cuadra', () => {
    const sin = construirCorrida([emp(5_000_000)], TASAS_NOMINA_2026, MES).lineas[0];
    const { lineas, totales } = construirCorrida(
      [emp(5_000_000, [ingreso(1_000_000), descuento(150_000)])], TASAS_NOMINA_2026, MES,
    );
    const l = lineas[0];
    expect(l.brutoCents).toBe(6_000_000);
    expect(l.otrasDeduccionesCents).toBe(150_000);
    expect(l.brutoCents - l.totalDeduccionesCents).toBe(l.netoCents);
    expect(l.netoCents).toBeGreaterThan(sin.netoCents);
    expect(totales.totalNetoCents).toBe(l.netoCents);
    expect(l.conceptos).toHaveLength(2);
  });

  it('quincenal: el concepto cae entero en la quincena donde se aplica', () => {
    const q1 = construirCorrida([emp(5_000_000, [ingreso(1_000_000, false)])], TASAS_NOMINA_2026, Q1).lineas[0];
    const q2 = construirCorrida([emp(5_000_000)], TASAS_NOMINA_2026, Q2).lineas[0];
    const q1Sin = construirCorrida([emp(5_000_000)], TASAS_NOMINA_2026, Q1).lineas[0];
    expect(q1.brutoCents).toBe(q1Sin.brutoCents + 1_000_000);
    expect(q1.isrCents).toBe(q1Sin.isrCents);
    expect(q2.brutoCents + q1Sin.brutoCents).toBe(5_000_000);
  });
});

describe('asiento con conceptos de cuenta propia', () => {
  const C: CuentasNomina = {
    gastoSueldos: 6104, gastoAportes: 6105, retencionTss: 2106, isr: 2108, otrasDeducciones: 2101,
    aportesTss: 2107, infotep: 2109, sueldosPorPagar: 2105,
  };
  const { lineas } = construirCorrida(
    [emp(5_000_000, [ingreso(1_000_000, true, 6120), descuento(150_000, { cuentaId: 1210 })])],
    TASAS_NOMINA_2026, MES,
  );
  const l = lineas[0];
  const sumas: SumasCorrida = {
    brutoCents: l.brutoCents, netoCents: l.netoCents,
    retencionTssCents: l.afpEmpleadoCents + l.sfsEmpleadoCents, isrCents: l.isrCents,
    otrasDeduccionesCents: l.otrasDeduccionesCents,
    aportesTssCents: l.afpPatronalCents + l.sfsPatronalCents + l.srlPatronalCents, infotepCents: l.infotepPatronalCents,
    conceptos: [
      { cuentaId: 6120, tipo: 'ingreso', montoCents: 1_000_000, nombre: 'Incentivo' },
      { cuentaId: 1210, tipo: 'descuento', montoCents: 150_000, nombre: 'Avance' },
    ],
  };
  const ls = lineasDevengoNomina(sumas, C);
  const debe = ls.reduce((s, x) => s + x.debeCents, 0);
  const haber = ls.reduce((s, x) => s + x.haberCents, 0);

  it('cuadra', () => expect(debe).toBe(haber));
  it('el incentivo va a su gasto y el sueldo conserva el resto', () => {
    expect(ls.find((x) => x.cuentaId === 6120)?.debeCents).toBe(1_000_000);
    expect(ls.find((x) => x.cuentaId === 6104)?.debeCents).toBe(5_000_000);
  });
  it('el descuento acredita su cuenta (por cobrar al empleado) y no la general', () => {
    expect(ls.find((x) => x.cuentaId === 1210)?.haberCents).toBe(150_000);
    expect(ls.find((x) => x.cuentaId === 2101)).toBeUndefined();
  });
});
