import { describe, it, expect } from 'vitest';
import {
  lineasDevengoNomina, lineasPagoObligacion, lineasPagoSueldos, lineasProvisionNomina,
  type CuentasNomina, type SumasCorrida,
} from '@/lib/contabilidad/nomina-asientos';
import type { LineaAsiento } from '@/lib/contabilidad/asientos';

/**
 * Los montos son los de la corrida de noviembre del sandbox (bruto RD$196,000):
 * retenciones TSS 13,848.66 (con un dependiente), ISR 9,462.36, aportes TSS
 * 31,063.54, INFOTEP 1,960.00, neto 172,688.98.
 */
const SUMAS: SumasCorrida = {
  brutoCents: 19_600_000,
  netoCents: 17_268_898,
  retencionTssCents: 1_384_866,
  isrCents: 946_236,
  otrasDeduccionesCents: 0,
  aportesTssCents: 3_106_354,
  infotepCents: 196_000,
};

const C: CuentasNomina & { banco: number } = {
  gastoSueldos: 6104, gastoAportes: 6105, retencionTss: 2106, isr: 2108, otrasDeducciones: 2101,
  aportesTss: 2107, infotep: 2109, sueldosPorPagar: 2105, banco: 1102,
};

const debe = (ls: LineaAsiento[]) => ls.reduce((s, l) => s + l.debeCents, 0);
const haber = (ls: LineaAsiento[]) => ls.reduce((s, l) => s + l.haberCents, 0);
const saldo = (asientos: LineaAsiento[][], cuenta: number) =>
  asientos.flat().filter((l) => l.cuentaId === cuenta).reduce((s, l) => s + l.haberCents - l.debeCents, 0);

describe('devengo de la corrida', () => {
  const ls = lineasDevengoNomina(SUMAS, C);

  it('cuadra: bruto + aportes = retenciones + ISR + aportes por pagar + INFOTEP + neto', () => {
    expect(debe(ls)).toBe(haber(ls));
    expect(debe(ls)).toBe(19_600_000 + 3_302_354);
  });

  it('cada pasivo en su cuenta: TSS, DGII e INFOTEP por separado', () => {
    const por = (cuenta: number) => ls.find((l) => l.cuentaId === cuenta);
    expect(por(2106)?.haberCents).toBe(1_384_866);
    expect(por(2108)?.haberCents).toBe(946_236);
    expect(por(2107)?.haberCents).toBe(3_106_354);
    expect(por(2109)?.haberCents).toBe(196_000);
    expect(por(2105)?.haberCents).toBe(17_268_898);
    expect(por(6105)?.debeCents).toBe(3_302_354);
  });

  it('no deja líneas en cero', () => {
    expect(ls.some((l) => l.cuentaId === 2101)).toBe(false);
  });

  it('cuadra aunque las cuentas caigan todas en la misma (sin configurar)', () => {
    const generica = { gastoSueldos: 6101, gastoAportes: 6101, retencionTss: 2101, isr: 2101, otrasDeducciones: 2101, aportesTss: 2101, infotep: 2101, sueldosPorPagar: 2101 };
    const l2 = lineasDevengoNomina({ ...SUMAS, otrasDeduccionesCents: 50_000, netoCents: SUMAS.netoCents - 50_000 }, generica);
    expect(debe(l2)).toBe(haber(l2));
  });
});

describe('pagos que saldan el devengo', () => {
  const devengo = lineasDevengoNomina(SUMAS, C);
  const pagoTss = lineasPagoObligacion(
    { destino: 'TSS', montoCents: 1_384_866 + 3_302_354, retencionesCents: 1_384_866, aportesCents: 3_302_354, infotepCents: 196_000 },
    { ...C, salida: C.banco },
  );
  const pagoDgii = lineasPagoObligacion(
    { destino: 'DGII', montoCents: 946_236, retencionesCents: 946_236, aportesCents: 0, infotepCents: 0 },
    { ...C, salida: C.banco },
  );
  const pagoSueldos = lineasPagoSueldos(17_268_898, { sueldosPorPagar: C.sueldosPorPagar, salida: C.banco });

  it('cada pago cuadra', () => {
    for (const ls of [pagoTss, pagoDgii, pagoSueldos]) expect(debe(ls)).toBe(haber(ls));
  });

  it('el pago a la TSS separa el INFOTEP de los aportes', () => {
    expect(pagoTss.find((l) => l.cuentaId === 2107)?.debeCents).toBe(3_106_354);
    expect(pagoTss.find((l) => l.cuentaId === 2109)?.debeCents).toBe(196_000);
  });

  it('pagado todo, todos los pasivos de nómina quedan en cero', () => {
    const libro = [devengo, pagoTss, pagoDgii, pagoSueldos];
    for (const cuenta of [2105, 2106, 2107, 2108, 2109]) expect(saldo(libro, cuenta)).toBe(0);
    // Y del banco salió exactamente lo que costó la nómina sin provisiones
    // (saldo = haber − debe: las salidas del banco van al haber).
    expect(saldo(libro, 1102)).toBe(19_600_000 + 3_302_354);
  });

  it('pagar sueldos sin pagar al Estado deja abiertas solo las obligaciones', () => {
    const libro = [devengo, pagoSueldos];
    expect(saldo(libro, 2105)).toBe(0);
    expect(saldo(libro, 2106)).toBe(1_384_866);
    expect(saldo(libro, 2108)).toBe(946_236);
  });
});

describe('provisión', () => {
  it('una cuenta de gasto y una de pasivo por derecho, y cuadra', () => {
    const ls = lineasProvisionNomina(
      { regaliaCents: 83_333, vacacionesCents: 48_958, cesantiaCents: 73_437 },
      { regaliaGasto: 6106, regaliaPasivo: 2110, vacacionesGasto: 6107, vacacionesPasivo: 2111, cesantiaGasto: 6108, cesantiaPasivo: 2112 },
    );
    expect(debe(ls)).toBe(haber(ls));
    expect(debe(ls)).toBe(205_728);
    expect(ls.find((l) => l.cuentaId === 2112)?.haberCents).toBe(73_437);
    expect(ls.find((l) => l.cuentaId === 6106)?.debeCents).toBe(83_333);
  });
});
