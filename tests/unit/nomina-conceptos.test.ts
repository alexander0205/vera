import { describe, it, expect } from 'vitest';
import {
  aConceptoAplicable, aplicaEnCorrida, aplicarConceptos, cuotaPrestamo, cuotasDePrestamo,
  fechaRazonable, limpiarTexto, parseMontoPesos, CONCEPTOS_SEMILLA,
  type ConceptoAplicable,
} from '@/lib/nomina/conceptos';
import { calcularNominaEmpleado, type ParametrosNomina } from '@/lib/nomina/calculo';
import { lineasDevengoNomina, type CuentasNomina, type SumasCorrida } from '@/lib/contabilidad/nomina-asientos';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const MENSUAL: ParametrosNomina = { salarioMensualCents: 6_000_000, tasas: TASAS_NOMINA_2026 }; // RD$60,000
const base = calcularNominaEmpleado(MENSUAL);

const ingreso = (montoCents: number, cotizaTss: boolean, gravaIsr: boolean): ConceptoAplicable =>
  ({ conceptoId: 1, tipo: 'ingreso', nombre: 'Incentivo', montoCents, cotizaTss, gravaIsr });
const descuento = (montoCents: number, extra: Partial<ConceptoAplicable> = {}): ConceptoAplicable =>
  ({ conceptoId: 2, tipo: 'descuento', nombre: 'Avance', montoCents, cotizaTss: false, gravaIsr: false, ...extra });

describe('conceptos que cotizan y/o gravan', () => {
  it('sin conceptos devuelve el desglose intacto', () => {
    const r = aplicarConceptos(base, MENSUAL, []);
    expect(r.desglose).toBe(base);
    expect(r.aplicados).toHaveLength(0);
  });

  it('un ingreso que cotiza y grava sube TSS e ISR como si fuera sueldo', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(1_000_000, true, true)]);
    const esperado = calcularNominaEmpleado({ ...MENSUAL, salarioMensualCents: 7_000_000 });
    expect(r.desglose.brutoCents).toBe(7_000_000);
    expect(r.desglose.afpEmpleadoCents).toBe(esperado.afpEmpleadoCents);
    expect(r.desglose.sfsEmpleadoCents).toBe(esperado.sfsEmpleadoCents);
    expect(r.desglose.isrCents).toBe(esperado.isrCents);
    expect(r.desglose.infotepPatronalCents).toBe(esperado.infotepPatronalCents);
    expect(r.desglose.netoCents).toBe(esperado.netoCents);
  });

  it('un ingreso exento (ni TSS ni ISR) se paga completo y no mueve deducciones', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(500_000, false, false)]);
    expect(r.desglose.brutoCents).toBe(base.brutoCents + 500_000);
    expect(r.desglose.afpEmpleadoCents).toBe(base.afpEmpleadoCents);
    expect(r.desglose.isrCents).toBe(base.isrCents);
    expect(r.desglose.totalPatronalCents).toBe(base.totalPatronalCents);
    expect(r.desglose.netoCents).toBe(base.netoCents + 500_000);
  });

  it('cotiza a la TSS pero no grava ISR: sube AFP/SFS y el ISR no sube', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(1_000_000, true, false)]);
    expect(r.desglose.afpEmpleadoCents).toBeGreaterThan(base.afpEmpleadoCents);
    expect(r.desglose.isrCents).toBeLessThanOrEqual(base.isrCents);
    expect(r.desglose.brutoCents).toBe(base.brutoCents + 1_000_000);
  });

  it('grava ISR pero no cotiza a la TSS: el ISR sube y la TSS queda igual', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(1_000_000, false, true)]);
    expect(r.desglose.afpEmpleadoCents).toBe(base.afpEmpleadoCents);
    expect(r.desglose.sfsEmpleadoCents).toBe(base.sfsEmpleadoCents);
    expect(r.desglose.isrCents).toBeGreaterThan(base.isrCents);
    expect(r.desglose.totalPatronalCents).toBe(base.totalPatronalCents);
  });

  it('el neto siempre es bruto menos deducciones', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(800_000, true, true), ingreso(200_000, false, false), descuento(300_000)]);
    const d = r.desglose;
    expect(d.netoCents).toBe(d.brutoCents - d.totalDeduccionesCents);
    expect(d.totalDeduccionesCents).toBe(d.afpEmpleadoCents + d.sfsEmpleadoCents + d.isrCents + d.dependientesAdicionalesCents + d.otrasDeduccionesCents);
  });

  it('los valores de fábrica de los ingresos cotizan y gravan; los descuentos no llevan marcas', () => {
    for (const c of CONCEPTOS_SEMILLA) {
      if (c.tipo === 'ingreso') { expect(c.cotizaTss).toBe(true); expect(c.gravaIsr).toBe(true); }
      else { expect(c.cotizaTss).toBe(false); expect(c.gravaIsr).toBe(false); }
    }
  });

  it('un descuento no puede llevar marcas de ingreso', () => {
    const a = aConceptoAplicable({
      conceptoId: 3, tipo: 'descuento', nombre: 'Seguro', cotizaTss: true, gravaIsr: true, cuentaId: null,
      montoCents: 100_000, fijo: true, desde: '2026-01-01', hasta: null, comentario: null,
    });
    expect(a.cotizaTss).toBe(false);
    expect(a.gravaIsr).toBe(false);
  });
});

describe('descuentos y préstamos', () => {
  it('se descuentan del neto y quedan en otras deducciones', () => {
    const r = aplicarConceptos(base, MENSUAL, [descuento(500_000)]);
    expect(r.desglose.otrasDeduccionesCents).toBe(500_000);
    expect(r.desglose.netoCents).toBe(base.netoCents - 500_000);
    expect(r.noAplicadoCents).toBe(0);
  });

  it('nunca dejan el neto en negativo: lo que no cabe se avisa y no se descuenta', () => {
    const r = aplicarConceptos(base, MENSUAL, [descuento(base.netoCents + 1_000_000)]);
    expect(r.desglose.netoCents).toBe(0);
    expect(r.noAplicadoCents).toBe(1_000_000);
    expect(r.aplicados[0].montoCents).toBe(base.netoCents);
    expect(r.aplicados[0].pedidoCents).toBe(base.netoCents + 1_000_000);
  });

  it('con varios descuentos, el último es el que se queda corto', () => {
    const r = aplicarConceptos(base, MENSUAL, [descuento(base.netoCents - 100_000, { nombre: 'Primero' }), descuento(300_000, { nombre: 'Préstamo', prestamoId: 9 })]);
    expect(r.aplicados.find((a) => a.nombre === 'Primero')!.montoCents).toBe(base.netoCents - 100_000);
    expect(r.aplicados.find((a) => a.nombre === 'Préstamo')!.montoCents).toBe(100_000);
    expect(r.noAplicadoCents).toBe(200_000);
  });

  it('cuota de préstamo: la cuota, o el saldo si queda menos', () => {
    expect(cuotaPrestamo({ id: 1, saldoCents: 1_000_000, cuotaCents: 250_000 })).toBe(250_000);
    expect(cuotaPrestamo({ id: 1, saldoCents: 100_000, cuotaCents: 250_000 })).toBe(100_000);
    expect(cuotaPrestamo({ id: 1, saldoCents: 0, cuotaCents: 250_000 })).toBe(0);
  });

  it('un préstamo se salda en las cuotas esperadas (la última, menor)', () => {
    let saldo = 1_000_000;
    const cuota = 300_000;
    const pagos: number[] = [];
    while (saldo > 0) {
      const c = cuotaPrestamo({ id: 1, saldoCents: saldo, cuotaCents: cuota });
      pagos.push(c);
      saldo -= c;
    }
    expect(pagos).toEqual([300_000, 300_000, 300_000, 100_000]);
    expect(pagos.length).toBe(cuotasDePrestamo(1_000_000, cuota));
    expect(pagos.reduce((s, x) => s + x, 0)).toBe(1_000_000);
  });
});

describe('vigencia de una asignación', () => {
  it('fija: aplica si su vigencia toca la corrida', () => {
    const a = { fijo: true, desde: '2026-03-01', hasta: '2026-06-30' };
    expect(aplicaEnCorrida(a, '2026-05-01', '2026-05-31')).toBe(true);
    expect(aplicaEnCorrida(a, '2026-07-01', '2026-07-31')).toBe(false);
    expect(aplicaEnCorrida(a, '2026-02-01', '2026-02-28')).toBe(false);
    expect(aplicaEnCorrida({ ...a, hasta: null }, '2027-01-01', '2027-01-31')).toBe(true);
  });

  it('de una sola vez: solo en la corrida cuyo rango contiene su fecha', () => {
    const a = { fijo: false, desde: '2026-05-20', hasta: null };
    expect(aplicaEnCorrida(a, '2026-05-16', '2026-05-31')).toBe(true);
    expect(aplicaEnCorrida(a, '2026-05-01', '2026-05-15')).toBe(false);
  });
});

describe('lo que escribe una persona', () => {
  it('parsea montos en pesos', () => {
    expect(parseMontoPesos('1,500.50')).toEqual({ ok: true, cents: 150_050 });
    expect(parseMontoPesos(2500)).toEqual({ ok: true, cents: 250_000 });
    expect(parseMontoPesos('RD$ 300')).toEqual({ ok: true, cents: 30_000 });
  });
  it('rechaza lo ambiguo, cero, negativo y lo exagerado', () => {
    for (const v of ['12,50', '0', '-5', '1.234', 'abc', null, 1e12]) expect(parseMontoPesos(v).ok).toBe(false);
  });
  it('limpia texto y valida fechas', () => {
    expect(limpiarTexto('  hola\u0000   mundo ', 50)).toBe('hola mundo');
    expect(limpiarTexto('   ', 10)).toBeNull();
    expect(fechaRazonable('2026-02-29')).toBe(false);
    expect(fechaRazonable('9999-12-31')).toBe(false);
    expect(fechaRazonable('2026-12-31')).toBe(true);
  });
});

describe('asiento con cuenta propia por concepto', () => {
  const C: CuentasNomina = {
    gastoSueldos: 6104, gastoAportes: 6105, retencionTss: 2106, isr: 2108, otrasDeducciones: 2101,
    aportesTss: 2107, infotep: 2109, sueldosPorPagar: 2105,
  };
  it('cuadra con ingresos y descuentos en cuentas propias (CxC a empleados)', () => {
    const r = aplicarConceptos(base, MENSUAL, [ingreso(1_000_000, true, true), descuento(400_000)]);
    const d = r.desglose;
    const sumas: SumasCorrida = {
      brutoCents: d.brutoCents, netoCents: d.netoCents, retencionTssCents: d.afpEmpleadoCents + d.sfsEmpleadoCents,
      isrCents: d.isrCents, otrasDeduccionesCents: d.otrasDeduccionesCents,
      aportesTssCents: d.afpPatronalCents + d.sfsPatronalCents + d.srlPatronalCents, infotepCents: d.infotepPatronalCents,
      conceptos: [
        { cuentaId: 6120, tipo: 'ingreso', montoCents: 1_000_000, nombre: 'Incentivo' },
        { cuentaId: 1108, tipo: 'descuento', montoCents: 400_000, nombre: 'Avance' },
      ],
    };
    const ls = lineasDevengoNomina(sumas, C);
    const debe = ls.reduce((s, l) => s + l.debeCents, 0);
    const haber = ls.reduce((s, l) => s + l.haberCents, 0);
    expect(debe).toBe(haber);
    expect(ls.find((l) => l.cuentaId === 1108)?.haberCents).toBe(400_000);
    expect(ls.find((l) => l.cuentaId === 6120)?.debeCents).toBe(1_000_000);
  });

  it('un ingreso pagado contra la reserva (vacaciones por pagar) cuadra y no duplica el gasto', () => {
    const sumas: SumasCorrida = {
      brutoCents: 5_000_000, netoCents: 5_000_000, retencionTssCents: 0, isrCents: 0, otrasDeduccionesCents: 0,
      aportesTssCents: 0, infotepCents: 0,
      conceptos: [{ cuentaId: 6107, tipo: 'ingreso', montoCents: 1_000_000, nombre: 'Vacaciones', reservaCuentaId: 2111, reservaUsadaCents: 600_000 }],
    };
    const ls = lineasDevengoNomina(sumas, C);
    expect(ls.reduce((s, l) => s + l.debeCents, 0)).toBe(ls.reduce((s, l) => s + l.haberCents, 0));
    expect(ls.find((l) => l.cuentaId === 2111)?.debeCents).toBe(600_000);
    expect(ls.find((l) => l.cuentaId === 6107)?.debeCents).toBe(400_000);
  });
});
