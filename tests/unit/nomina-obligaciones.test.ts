import { describe, it, expect } from 'vitest';
import { obligacionesDeLineas, type LineaObligacion } from '@/lib/nomina/obligaciones';

const linea = (o: Partial<LineaObligacion> = {}): LineaObligacion => ({
  afpEmpleadoCents: 100_450, sfsEmpleadoCents: 106_400, isrCents: 50_000,
  afpPatronalCents: 248_500, sfsPatronalCents: 248_150, srlPatronalCents: 38_500, infotepPatronalCents: 35_000,
  ...o,
});

describe('obligacionesDeLineas', () => {
  it('agrupa TSS (AFP+SFS emp+pat, SRL, INFOTEP) y DGII (ISR)', () => {
    const [tss, dgii] = obligacionesDeLineas([linea()]);
    expect(tss.destino).toBe('TSS');
    expect(tss.parteRetencionesCents).toBe(100_450 + 106_400);
    expect(tss.parteAportesCents).toBe(248_500 + 248_150 + 38_500 + 35_000);
    expect(tss.montoCents).toBe(tss.parteRetencionesCents + tss.parteAportesCents);
    expect(dgii.destino).toBe('DGII');
    expect(dgii.montoCents).toBe(50_000);
    expect(dgii.parteRetencionesCents).toBe(50_000);
    expect(dgii.parteAportesCents).toBe(0);
  });

  it('suma varias líneas', () => {
    const [tss, dgii] = obligacionesDeLineas([linea(), linea()]);
    expect(dgii.montoCents).toBe(100_000);
    expect(tss.parteRetencionesCents).toBe((100_450 + 106_400) * 2);
  });

  it('omite un destino sin monto (ISR 0 → sin DGII)', () => {
    const obl = obligacionesDeLineas([linea({ isrCents: 0 })]);
    expect(obl.map((o) => o.destino)).toEqual(['TSS']);
  });

  it('lista vacía → sin obligaciones', () => {
    expect(obligacionesDeLineas([])).toEqual([]);
  });

  it('el total de las obligaciones = todas las retenciones + aportes de la corrida', () => {
    const l = linea();
    const obl = obligacionesDeLineas([l]);
    const suma = obl.reduce((s, o) => s + o.montoCents, 0);
    const esperado = l.afpEmpleadoCents + l.sfsEmpleadoCents + l.isrCents
      + l.afpPatronalCents + l.sfsPatronalCents + l.srlPatronalCents + l.infotepPatronalCents;
    expect(suma).toBe(esperado);
  });
});
