import { describe, it, expect } from 'vitest';
import { calcularNominaEmpleado, explicarIsr, isrMensualCents } from '@/lib/nomina/calculo';
import {
  TASAS_NOMINA_2026, type TasasNomina,
  capitaDependienteVigente, capitaTotalCents, salarioMinimoSector, tablaSalarioMinimo, esTasaSrl, tasasDelAnio,
} from '@/lib/config/nomina-tasas';

/**
 * Motor de nómina. Los montos esperados están calculados a mano con las tasas
 * 2026 y SMC=0 (sin tope, el default hasta confirmar el SMC con la TSS). Si un
 * número cambia porque se corrigió una tasa, este test es el que avisa.
 */
describe('calcularNominaEmpleado — tasas 2026, sin tope', () => {
  it('sueldo bajo: exento de ISR (RD$30,000)', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026 });
    expect(r.afpEmpleadoCents).toBe(86_100);   // 3,000,000 × 2.87%
    expect(r.sfsEmpleadoCents).toBe(91_200);   // 3,000,000 × 3.04%
    expect(r.isrCents).toBe(0);                // renta anual 338,724 < 416,220
    expect(r.totalDeduccionesCents).toBe(177_300);
    expect(r.netoCents).toBe(2_822_700);       // RD$28,227.00
    // Patronal
    expect(r.afpPatronalCents).toBe(213_000);
    expect(r.sfsPatronalCents).toBe(212_700);
    expect(r.srlPatronalCents).toBe(33_000);   // 3,000,000 × 1.10%
    expect(r.infotepPatronalCents).toBe(30_000);
    expect(r.totalPatronalCents).toBe(488_700);
  });

  it('tramo medio del ISR 15% (RD$50,000)', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026 });
    expect(r.afpEmpleadoCents).toBe(143_500);
    expect(r.sfsEmpleadoCents).toBe(152_000);
    expect(r.baseIsrMensualCents).toBe(4_704_500);
    expect(r.isrCents).toBe(185_400);          // (564,540 − 416,220) × 15% ÷ 12
    expect(r.netoCents).toBe(4_519_100);
  });

  it('tramo alto del ISR 25% (RD$100,000)', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 10_000_000, tasas: TASAS_NOMINA_2026 });
    expect(r.afpEmpleadoCents).toBe(287_000);
    expect(r.sfsEmpleadoCents).toBe(304_000);
    expect(r.isrCents).toBe(1_210_544);        // escala tope, redondeado al centavo
    expect(r.totalDeduccionesCents).toBe(1_801_544);
    expect(r.netoCents).toBe(8_198_456);       // RD$81,984.56
  });

  it('otras deducciones bajan el neto pero no la base del ISR', () => {
    const base = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026 });
    const con = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026, otrasDeduccionesCents: 50_000 });
    expect(con.isrCents).toBe(base.isrCents);
    expect(con.netoCents).toBe(base.netoCents - 50_000);
  });

  it('sueldo alto: aplica los topes reales de la TSS (RD$300,000)', () => {
    // SMC 2026 ya definido en las tasas: tope SFS RD$232,230, SRL RD$92,892,
    // AFP RD$464,460. Este sueldo pasa los dos primeros pero no el de AFP.
    const r = calcularNominaEmpleado({ salarioMensualCents: 30_000_000, tasas: TASAS_NOMINA_2026 });
    expect(r.afpEmpleadoCents).toBe(861_000);  // 30M × 2.87% (bajo el tope AFP)
    expect(r.sfsEmpleadoCents).toBe(705_979);  // tope SFS 23,223,000 × 3.04%
    expect(r.srlPatronalCents).toBe(102_181);  // tope SRL  9,289,200 × 1.10%
  });

  it('salario cero → todo en cero, sin negativos', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 0, tasas: TASAS_NOMINA_2026 });
    expect(r.netoCents).toBe(0);
    expect(r.totalDeduccionesCents).toBe(0);
    expect(r.totalPatronalCents).toBe(0);
  });
});

describe('tope del salario cotizable (cuando el SMC está definido)', () => {
  const conTope: TasasNomina = {
    ...TASAS_NOMINA_2026,
    salarioMinimoCotizableCents: 1_000_000, // SMC RD$10,000 (ejemplo)
    // topeAfp = 20 SMC = RD$200,000 ; topeSfs = 10 SMC = RD$100,000
  };

  it('capa AFP y SFS al tope, no al salario íntegro', () => {
    // Salario RD$250,000: por encima de ambos topes.
    const r = calcularNominaEmpleado({ salarioMensualCents: 25_000_000, tasas: conTope });
    expect(r.afpEmpleadoCents).toBe(574_000);  // min(25M, 20M) × 2.87% = 20M × 2.87%
    expect(r.sfsEmpleadoCents).toBe(304_000);  // min(25M, 10M) × 3.04% = 10M × 3.04%
    // INFOTEP sí va sobre el salario íntegro (sin tope)
    expect(r.infotepPatronalCents).toBe(250_000); // 25M × 1%
  });
});

describe('isrMensualCents', () => {
  it('base no positiva → 0', () => {
    expect(isrMensualCents(0, TASAS_NOMINA_2026.isrEscala)).toBe(0);
    expect(isrMensualCents(-100, TASAS_NOMINA_2026.isrEscala)).toBe(0);
  });

  it('justo bajo el mínimo exento → 0', () => {
    // 416,220 anual ÷ 12 = 34,685 mensual. Un peso menos sigue exento.
    expect(isrMensualCents(3_468_499, TASAS_NOMINA_2026.isrEscala)).toBe(0);
  });
});

/**
 * Piso de cotización: la TSS no admite reportar a nadie por debajo del salario
 * mínimo de su sector sin dispensa. Solo sube la base de AFP, SFS y SRL; lo que
 * se paga, el ISR y el INFOTEP siguen sobre el salario real.
 */
describe('piso de cotización (salario mínimo del sector)', () => {
  const PISO_PEQUENA = 1_842_120; // RD$18,421.20, CNS-01-2025 desde 2026-02-01

  it('RD$15,000 en pequeña empresa cotiza AFP/SFS/SRL sobre RD$18,421.20', () => {
    const r = calcularNominaEmpleado({
      salarioMensualCents: 1_500_000, tasas: TASAS_NOMINA_2026, pisoCotizableCents: PISO_PEQUENA,
    });
    const sobrePiso = calcularNominaEmpleado({ salarioMensualCents: PISO_PEQUENA, tasas: TASAS_NOMINA_2026 });

    expect(r.brutoCents).toBe(1_500_000);
    expect(r.salarioCotizableCents).toBe(PISO_PEQUENA);
    expect(r.afpEmpleadoCents).toBe(52_869);   // 1,842,120 × 2.87%
    expect(r.sfsEmpleadoCents).toBe(56_000);   // 1,842,120 × 3.04%
    expect(r.afpPatronalCents).toBe(sobrePiso.afpPatronalCents);
    expect(r.sfsPatronalCents).toBe(sobrePiso.sfsPatronalCents);
    expect(r.srlPatronalCents).toBe(sobrePiso.srlPatronalCents);
    // ISR sobre lo que gana de verdad; INFOTEP sobre el salario real, sin piso.
    expect(r.baseIsrMensualCents).toBe(1_500_000 - 52_869 - 56_000);
    expect(r.infotepPatronalCents).toBe(15_000);
    expect(r.netoCents).toBe(1_500_000 - 52_869 - 56_000 - r.isrCents);
  });

  it('un salario por encima del piso no cambia nada', () => {
    const sin = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026 });
    const con = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026, pisoCotizableCents: PISO_PEQUENA });
    expect(con).toEqual(sin);
    expect(con.salarioCotizableCents).toBe(3_000_000);
  });

  it('sin salario no hay piso: una ficha en cero no cotiza', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 0, tasas: TASAS_NOMINA_2026, pisoCotizableCents: PISO_PEQUENA });
    expect(r.salarioCotizableCents).toBe(0);
    expect(r.totalPatronalCents).toBe(0);
    expect(r.netoCents).toBe(0);
  });
});

describe('tasa SRL de la empresa', () => {
  it('reemplaza la del año: RD$30,000 al 1.30 % → RD$390', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 3_000_000, tasas: TASAS_NOMINA_2026, srlTasa: 0.013 });
    expect(r.srlPatronalCents).toBe(39_000);
    expect(r.totalPatronalCents).toBe(213_000 + 212_700 + 39_000 + 30_000);
  });

  it('solo acepta el rango de ley, 1.10 % a 1.30 %', () => {
    expect(esTasaSrl(0.011)).toBe(true);
    expect(esTasaSrl(0.013)).toBe(true);
    expect(esTasaSrl(0.012)).toBe(true);
    expect(esTasaSrl(0.01)).toBe(false);
    expect(esTasaSrl(0.0131)).toBe(false);
    expect(esTasaSrl(Number.NaN)).toBe(false);
  });
});

/**
 * Dependientes adicionales del SFS: RD$1,919.78 por cada uno (Res. CNSS 624-02).
 * Se descuentan del neto; no bajan la base del ISR.
 */
describe('dependientes adicionales', () => {
  it('RD$50,000 con dos adicionales: −RD$3,839.56 del neto, mismo ISR', () => {
    const base = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026 });
    const r = calcularNominaEmpleado({
      salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026, dependientesAdicionales: 2, capitaDependienteCents: 191_978,
    });
    expect(r.dependientesAdicionales).toBe(2);
    expect(r.dependientesAdicionalesCents).toBe(383_956);
    expect(r.isrCents).toBe(base.isrCents);
    expect(r.totalDeduccionesCents).toBe(143_500 + 152_000 + 185_400 + 383_956);
    expect(r.netoCents).toBe(4_135_144);
    // Lo que paga la empresa no cambia: la cápita la paga el trabajador.
    expect(r.totalPatronalCents).toBe(base.totalPatronalCents);
  });

  it('sin cápita o sin dependientes no descuenta nada', () => {
    const r = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026, dependientesAdicionales: 3 });
    expect(r.dependientesAdicionalesCents).toBe(0);
  });
});

describe('tarifas versionadas', () => {
  it('cápita vigente: RD$1,887.54 + RD$32.24 = RD$1,919.78 desde 2025-11-01', () => {
    const c = capitaDependienteVigente('2026-09-13');
    expect(c.resolucion).toBe('CNSS 624-02');
    expect(capitaTotalCents(c)).toBe(191_978);
    // Antes de la primera tarifa cargada devuelve esa misma (no hay otra).
    expect(capitaDependienteVigente('2025-01-01').vigenteDesde).toBe('2025-11-01');
  });

  it('salario mínimo CNS-01-2025 por tamaño desde 2026-02-01', () => {
    expect(salarioMinimoSector('micro', '2026-02-01')).toBe(1_699_320);
    expect(salarioMinimoSector('pequena', '2026-09-13')).toBe(1_842_120);
    expect(salarioMinimoSector('mediana', '2026-09-13')).toBe(2_748_960);
    expect(salarioMinimoSector('grande', '2026-09-13')).toBe(2_998_800);
  });

  it('antes de la primera tabla cargada no hay piso: no se inventa el tramo anterior', () => {
    expect(salarioMinimoSector('grande', '2026-01-31')).toBeNull();
    expect(tablaSalarioMinimo('2026-01-31')).toBeNull();
    expect(tablaSalarioMinimo('2026-02-01')?.resolucion).toBe('CNS-01-2025');
  });
});

/**
 * Escala 2027 de la Ley 30-26 (art. 10): exento hasta RD$480,000 al año y tramo
 * nuevo del 27 %. Los montos esperados están hechos a mano.
 */
describe('ISR 2027 · Ley 30-26', () => {
  const t27 = tasasDelAnio(2027);

  it('la escala es continua: cada monto fijo es lo que acumula el tramo anterior', () => {
    const e = t27.isrEscala;
    for (let k = 1; k < e.length - 1; k++) {
      const acumulado = e[k].fijoCents + (e[k + 1].desdeCents - e[k].desdeCents) * e[k].tasa;
      expect(acumulado).toBe(e[k + 1].fijoCents);
    }
    expect(e.map((x) => x.tasa)).toEqual([0, 0.15, 0.20, 0.25, 0.27]);
  });

  it('RD$40,000: exento en 2027, RD$442.65 en 2026', () => {
    // Base 40,000 − 1,148 − 1,216 = 37,636 → 451,632 al año.
    expect(calcularNominaEmpleado({ salarioMensualCents: 4_000_000, tasas: t27 }).isrCents).toBe(0);
    expect(calcularNominaEmpleado({ salarioMensualCents: 4_000_000, tasas: TASAS_NOMINA_2026 }).isrCents).toBe(44_265);
  });

  it('RD$50,000: RD$1,056.75 en 2027 (antes RD$1,854.00)', () => {
    // 564,540 al año → (564,540 − 480,000) × 15 % = 12,681 ÷ 12.
    expect(calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: t27 }).isrCents).toBe(105_675);
  });

  it('RD$100,000: tramo del 25 %', () => {
    // Base 94,090 → 1,129,080 al año → 75,750 + 219,080 × 25 % = 130,520 ÷ 12.
    expect(calcularNominaEmpleado({ salarioMensualCents: 10_000_000, tasas: t27 }).isrCents).toBe(1_087_667);
  });

  it('RD$500,000: tramo nuevo del 27 %, con los topes de la TSS', () => {
    // AFP tope 464,460 × 2.87 % = 13,330.00; SFS tope 232,230 × 3.04 % = 7,059.79.
    // Base 479,610.21 → 5,755,322.52 al año → 1,048,250 + 955,322.52 × 27 % ÷ 12.
    expect(calcularNominaEmpleado({ salarioMensualCents: 50_000_000, tasas: t27 }).isrCents).toBe(10_884_892);
  });

  it('solo cambia el ISR: las tasas de la TSS siguen como en 2026', () => {
    const { isrEscala: _a, anio: _b, ...tss27 } = t27;
    const { isrEscala: _c, anio: _d, ...tss26 } = TASAS_NOMINA_2026;
    expect(tss27).toEqual(tss26);
  });

  it('tasasDelAnio usa el año cargado más reciente anterior, o el primero', () => {
    expect(tasasDelAnio(2026).anio).toBe(2026);
    expect(tasasDelAnio(2027).anio).toBe(2027);
    expect(tasasDelAnio(2028).anio).toBe(2027);
    expect(tasasDelAnio(2025).anio).toBe(2026);
  });
});

describe('explicarIsr', () => {
  it('RD$30,000: renta anual 338,724 por debajo del exento 416,220', () => {
    const e = explicarIsr(2_822_700, TASAS_NOMINA_2026.isrEscala);
    expect(e.baseAnualCents).toBe(33_872_400);
    expect(e.exentoHastaCents).toBe(41_622_000);
    expect(e.tramo).toBeNull();
    expect(e.impuestoAnualCents).toBe(0);
  });

  it('RD$50,000: tramo del 15 % y el mismo impuesto que el motor', () => {
    const d = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas: TASAS_NOMINA_2026 });
    const e = explicarIsr(d.baseIsrMensualCents, TASAS_NOMINA_2026.isrEscala);
    expect(e.tramo?.tasa).toBe(0.15);
    expect(Math.round(e.impuestoAnualCents / 12)).toBe(d.isrCents);
  });

  it('RD$100,000: tramo del 25 % con su monto fijo', () => {
    const d = calcularNominaEmpleado({ salarioMensualCents: 10_000_000, tasas: TASAS_NOMINA_2026 });
    const e = explicarIsr(d.baseIsrMensualCents, TASAS_NOMINA_2026.isrEscala);
    expect(e.tramo?.fijoCents).toBe(7_977_600);
    expect(Math.round(e.impuestoAnualCents / 12)).toBe(d.isrCents);
  });
});
