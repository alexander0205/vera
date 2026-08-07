import { describe, it, expect } from 'vitest';
import {
  calcularMora, periodosDevengados, fechaPeriodo, describirMora,
  type ConfigMora, type EntradaMora,
} from '@/lib/cobranza/mora-calculo';

const RD = (pesos: number) => Math.round(pesos * 100);
const fmt = (cents: number) => `RD$${(cents / 100).toFixed(2)}`;

/** Config histórica: 2% una sola vez, sin gracia. */
const base: ConfigMora = {
  modo: 'porcentaje',
  porcentajeBps: 200,
  montoCents: 0,
  diasGracia: 0,
  periodicidadDias: 0,
  compuesta: false,
  topeBps: 0,
  maxPeriodos: 0,
};

function entrada(over: Partial<EntradaMora> = {}, cfg: Partial<ConfigMora> = {}): EntradaMora {
  return {
    config: { ...base, ...cfg },
    montoFacturaCents: RD(1000),
    saldoFacturaCents: RD(1000),
    moraImpagaCents: 0,
    moraCobradaAcumCents: 0,
    periodosCobrados: 0,
    diasVencido: 1,
    ...over,
  };
}

describe('periodosDevengados', () => {
  it('no devenga nada antes del vencimiento', () => {
    expect(periodosDevengados(-1, base)).toBe(0);
  });

  it('con periodicidad 0 siempre es un único período', () => {
    expect(periodosDevengados(1, base)).toBe(1);
    expect(periodosDevengados(400, base)).toBe(1);
  });

  it('respeta los días de gracia', () => {
    const cfg = { ...base, diasGracia: 5 };
    expect(periodosDevengados(4, cfg)).toBe(0);
    expect(periodosDevengados(5, cfg)).toBe(1);
  });

  it('suma un período por cada ciclo cumplido', () => {
    const cfg = { ...base, periodicidadDias: 30 };
    expect(periodosDevengados(0, cfg)).toBe(1);
    expect(periodosDevengados(29, cfg)).toBe(1);
    expect(periodosDevengados(30, cfg)).toBe(2);
    expect(periodosDevengados(90, cfg)).toBe(4);
  });
});

describe('modo porcentaje vs fijo', () => {
  it('porcentaje: 2% de RD$1,000 = RD$20', () => {
    const r = calcularMora(entrada());
    expect(r).toMatchObject({ aplica: true, montoCents: RD(20) });
  });

  it('fijo: cobra el monto configurado sin importar el saldo', () => {
    const r = calcularMora(entrada({ saldoFacturaCents: RD(50) }, { modo: 'fijo', montoCents: RD(500) }));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(500) });
  });

  it('porcentaje redondea al centavo', () => {
    // 2% de RD$10.05 = 20.1 centavos → 20
    const r = calcularMora(entrada({ saldoFacturaCents: 1005 }));
    expect(r).toMatchObject({ aplica: true, montoCents: 20 });
  });

  it('no aplica si el cargo redondea a cero', () => {
    const r = calcularMora(entrada({ saldoFacturaCents: 1 }));
    expect(r).toMatchObject({ aplica: false, razon: 'monto_cero' });
  });
});

describe('elegibilidad', () => {
  it('no aplica si aún no vence', () => {
    expect(calcularMora(entrada({ diasVencido: -3 }))).toMatchObject({ aplica: false, razon: 'no_vencida' });
  });

  it('no aplica dentro de la gracia', () => {
    const r = calcularMora(entrada({ diasVencido: 3 }, { diasGracia: 5 }));
    expect(r).toMatchObject({ aplica: false, razon: 'no_vencida' });
  });

  it('no aplica si la factura ya no tiene saldo', () => {
    expect(calcularMora(entrada({ saldoFacturaCents: 0 }))).toMatchObject({ aplica: false, razon: 'sin_saldo' });
  });

  it('no recobra un período ya cobrado', () => {
    const r = calcularMora(entrada({ periodosCobrados: 1 }));
    expect(r).toMatchObject({ aplica: false, razon: 'periodo_ya_cobrado' });
  });
});

describe('mora sobre mora (base compuesta)', () => {
  const colegio = { periodicidadDias: 30, compuesta: true, porcentajeBps: 1000 }; // 10% mensual

  it('el primer mes cobra sobre la factura sola', () => {
    const r = calcularMora(entrada({ diasVencido: 1 }, colegio));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(100), baseCents: RD(1000) });
  });

  it('el segundo mes cobra sobre factura + mora impaga', () => {
    const r = calcularMora(entrada(
      { diasVencido: 31, periodosCobrados: 1, moraImpagaCents: RD(100), moraCobradaAcumCents: RD(100) },
      colegio,
    ));
    // base = 1000 + 100 = 1100 → 10% = 110
    expect(r).toMatchObject({ aplica: true, montoCents: RD(110), baseCents: RD(1100) });
  });

  it('si pagó la mora anterior, no se capitaliza', () => {
    const r = calcularMora(entrada(
      { diasVencido: 31, periodosCobrados: 1, moraImpagaCents: 0, moraCobradaAcumCents: RD(100) },
      colegio,
    ));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(100), baseCents: RD(1000) });
  });

  it('en modo simple nunca capitaliza', () => {
    const r = calcularMora(entrada(
      { diasVencido: 31, periodosCobrados: 1, moraImpagaCents: RD(100) },
      { ...colegio, compuesta: false },
    ));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(100) });
  });
});

describe('topes', () => {
  it('corta al alcanzar el tope de períodos', () => {
    const r = calcularMora(entrada(
      { diasVencido: 200, periodosCobrados: 3 },
      { periodicidadDias: 30, maxPeriodos: 3 },
    ));
    expect(r).toMatchObject({ aplica: false, razon: 'max_periodos' });
  });

  it('recorta el último cargo para no pasarse del tope', () => {
    // tope 25% de RD$1,000 = RD$250; ya cobró RD$200 → solo caben RD$50
    const r = calcularMora(entrada(
      { diasVencido: 31, periodosCobrados: 1, moraCobradaAcumCents: RD(200) },
      { periodicidadDias: 30, porcentajeBps: 1000, topeBps: 2500 },
    ));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(50) });
  });

  it('no cobra nada si el tope ya se alcanzó', () => {
    const r = calcularMora(entrada(
      { diasVencido: 31, periodosCobrados: 1, moraCobradaAcumCents: RD(250) },
      { periodicidadDias: 30, topeBps: 2500 },
    ));
    expect(r).toMatchObject({ aplica: false, razon: 'tope_alcanzado' });
  });

  it('el tope se mide contra el monto de la factura, no contra el saldo', () => {
    // Factura RD$1,000 con abono parcial: saldo RD$400. Tope 25% = RD$250.
    const r = calcularMora(entrada(
      { saldoFacturaCents: RD(400), moraCobradaAcumCents: RD(240) },
      { topeBps: 2500, porcentajeBps: 1000 },
    ));
    expect(r).toMatchObject({ aplica: true, montoCents: RD(10) });
  });
});

describe('fechaPeriodo', () => {
  it('el primer período arranca en el vencimiento cuando no hay gracia', () => {
    expect(fechaPeriodo('2026-09-15', 1, base)).toBe('2026-09-15');
  });

  it('desplaza por los días de gracia', () => {
    expect(fechaPeriodo('2026-09-15', 1, { ...base, diasGracia: 5 })).toBe('2026-09-20');
  });

  it('avanza un ciclo por período', () => {
    const cfg = { ...base, periodicidadDias: 30 };
    expect(fechaPeriodo('2026-09-15', 2, cfg)).toBe('2026-10-15');
    expect(fechaPeriodo('2026-09-15', 3, cfg)).toBe('2026-11-14');
  });

  it('cruza fin de año sin romperse', () => {
    expect(fechaPeriodo('2026-12-20', 2, { ...base, periodicidadDias: 30 })).toBe('2027-01-19');
  });

  it('cada período da una fecha distinta — es la clave del índice único', () => {
    const cfg = { ...base, periodicidadDias: 30 };
    const fechas = [1, 2, 3, 4].map(p => fechaPeriodo('2026-09-15', p, cfg));
    expect(new Set(fechas).size).toBe(4);
  });
});

describe('describirMora', () => {
  it('explica un cargo fijo mensual', () => {
    expect(describirMora({ ...base, modo: 'fijo', montoCents: RD(500), periodicidadDias: 30 }, fmt))
      .toBe('RD$500.00 al vencer, y se repite cada 30 días mientras siga sin pagarse.');
  });

  it('explica un porcentaje con gracia y sin recurrencia', () => {
    expect(describirMora({ ...base, porcentajeBps: 250, diasGracia: 1 }, fmt))
      .toBe('2.50% 1 día después del vencimiento.');
  });
});

describe('regresión: comportamiento histórico intacto', () => {
  it('con la config por defecto se cobra una sola vez, como antes', () => {
    const primera = calcularMora(entrada({ diasVencido: 1 }));
    expect(primera).toMatchObject({ aplica: true, montoCents: RD(20) });

    // Un año después, con la nota ya emitida, no vuelve a cobrar.
    const despues = calcularMora(entrada({ diasVencido: 365, periodosCobrados: 1 }));
    expect(despues).toMatchObject({ aplica: false, razon: 'periodo_ya_cobrado' });
  });
});
