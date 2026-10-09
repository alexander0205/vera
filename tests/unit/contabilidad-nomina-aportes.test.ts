import { describe, it, expect } from 'vitest';
import { lineasDevengoNomina, lineasPagoObligacion, type CuentasNomina, type SumasCorrida } from '@/lib/contabilidad/nomina-asientos';

// Cuentas generales: una para todo el gasto de aportes y una para todo lo retenido.
const generales: CuentasNomina = {
  gastoSueldos: 1, gastoAportes: 2, retencionTss: 3, isr: 4, otrasDeducciones: 5,
  aportesTss: 6, infotep: 7, sueldosPorPagar: 8,
};
// Las del catálogo de un contador: cada concepto en la suya.
const separadas: CuentasNomina = {
  ...generales,
  gastoAporteSfs: 10, gastoAporteAfp: 11, gastoAporteSrl: 12, gastoAporteInfotep: 13,
  retencionSfs: 20, retencionAfp: 21,
};

// Una corrida chica con números redondos: bruto 100,000.
const sumas: SumasCorrida = {
  brutoCents: 10_000_000,
  netoCents: 8_800_000,
  retencionTssCents: 900_000,   // SFS 600,000 + AFP 300,000
  isrCents: 200_000,
  otrasDeduccionesCents: 100_000,
  aportesTssCents: 1_400_000,   // SFS 700,000 + AFP 500,000 + SRL 200,000
  infotepCents: 100_000,
  detalle: {
    sfsPatronalCents: 700_000, afpPatronalCents: 500_000, srlPatronalCents: 200_000,
    sfsEmpleadoCents: 600_000, afpEmpleadoCents: 300_000,
  },
};

const suma = (ls: { debeCents: number; haberCents: number }[]) =>
  ls.reduce((a, l) => ({ debe: a.debe + l.debeCents, haber: a.haber + l.haberCents }), { debe: 0, haber: 0 });
const porCuenta = (ls: { cuentaId: number; debeCents: number; haberCents: number }[], id: number) =>
  ls.filter((l) => l.cuentaId === id).reduce((a, l) => a + l.debeCents + l.haberCents, 0);

describe('devengo de nómina: cada aporte a su cuenta', () => {
  it('sin cuentas por concepto, todo junto como antes', () => {
    const ls = lineasDevengoNomina(sumas, generales);
    expect(porCuenta(ls, 2)).toBe(1_500_000);   // aportes + INFOTEP en una línea
    expect(porCuenta(ls, 3)).toBe(900_000);     // retenciones en una línea
    expect(ls.filter((l) => l.cuentaId === 2)).toHaveLength(1);
    expect(ls.filter((l) => l.cuentaId === 3)).toHaveLength(1);
  });

  it('con cuentas por concepto, una línea por cada uno', () => {
    const ls = lineasDevengoNomina(sumas, separadas);
    expect(porCuenta(ls, 10)).toBe(700_000);    // SFS patronal
    expect(porCuenta(ls, 11)).toBe(500_000);    // AFP patronal
    expect(porCuenta(ls, 12)).toBe(200_000);    // riesgos laborales
    expect(porCuenta(ls, 13)).toBe(100_000);    // INFOTEP
    expect(porCuenta(ls, 20)).toBe(600_000);    // SFS del empleado
    expect(porCuenta(ls, 21)).toBe(300_000);    // AFP del empleado
    expect(porCuenta(ls, 2)).toBe(0);           // la general ya no recibe nada
  });

  it('el asiento cuadra en los dos casos', () => {
    for (const c of [generales, separadas]) {
      const t = suma(lineasDevengoNomina(sumas, c));
      expect(t.debe).toBe(t.haber);
      expect(t.debe).toBe(11_500_000);          // bruto + aportes + INFOTEP
    }
  });

  it('un redondeo de la nómina no descuadra el asiento: la diferencia se queda en el SFS', () => {
    // El detalle no suma exactamente el total (un peso de más en el reparto).
    const torcidas: SumasCorrida = {
      ...sumas,
      detalle: { ...sumas.detalle!, sfsPatronalCents: 699_900, afpEmpleadoCents: 299_900 },
    };
    const ls = lineasDevengoNomina(torcidas, separadas);
    const t = suma(ls);
    expect(t.debe).toBe(t.haber);
    expect(porCuenta(ls, 10)).toBe(700_000);    // el SFS absorbe la diferencia
    expect(porCuenta(ls, 20)).toBe(600_100);
  });

  it('dos conceptos en la misma cuenta salen en una sola línea', () => {
    const mezcladas = { ...separadas, gastoAporteAfp: 10 };   // AFP apuntando al SFS
    const ls = lineasDevengoNomina(sumas, mezcladas);
    expect(ls.filter((l) => l.cuentaId === 10)).toHaveLength(1);
    expect(porCuenta(ls, 10)).toBe(1_200_000);
  });
});

describe('pago a la TSS: salda los mismos pasivos', () => {
  const pago = { destino: 'TSS' as const, montoCents: 2_400_000, retencionesCents: 900_000, aportesCents: 1_500_000, infotepCents: 100_000 };

  it('con las retenciones separadas, baja cada cuenta por lo suyo', () => {
    const ls = lineasPagoObligacion({ ...pago, retencionAfpCents: 300_000 }, { ...separadas, salida: 99 });
    expect(porCuenta(ls, 20)).toBe(600_000);
    expect(porCuenta(ls, 21)).toBe(300_000);
    const t = suma(ls);
    expect(t.debe).toBe(t.haber);
  });

  it('sin el desglose, una sola línea de retenciones', () => {
    const ls = lineasPagoObligacion(pago, { ...generales, salida: 99 });
    expect(ls.filter((l) => l.cuentaId === 3)).toHaveLength(1);
    expect(porCuenta(ls, 3)).toBe(900_000);
  });

  it('el pago a la DGII no se toca', () => {
    const ls = lineasPagoObligacion({ ...pago, destino: 'DGII', retencionesCents: 200_000, aportesCents: 0, infotepCents: 0, montoCents: 200_000 }, { ...separadas, salida: 99 });
    expect(ls).toHaveLength(2);
    expect(porCuenta(ls, 4)).toBe(200_000);
  });
});
