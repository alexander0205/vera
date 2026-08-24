import { describe, it, expect } from 'vitest';
import { calcularNominaEmpleado, isrMensualCents } from '@/lib/nomina/calculo';
import { TASAS_NOMINA_2026, type TasasNomina } from '@/lib/config/nomina-tasas';

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
