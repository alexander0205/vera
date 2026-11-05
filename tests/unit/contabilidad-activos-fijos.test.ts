import { describe, it, expect } from 'vitest';
import {
  BajaActivoError, CATEGORIAS_ACTIVO, calcularBaja, categoriaActivo, fichasDeCompra, lineasAsientoBaja,
  type CuentasBaja,
} from '@/lib/contabilidad/activos-fijos';
import { calcularCuotas, calcularCuotasConBajas } from '@/lib/contabilidad/depreciacion';
import { CATALOGO_BASE } from '@/lib/contabilidad/catalogo-base';

const cuentas: CuentasBaja = { activo: 1, deprecAcum: 2, cobro: 3, ganancia: 4, perdida: 5 };
const suma = (l: { debeCents: number; haberCents: number }[], k: 'debeCents' | 'haberCents') => l.reduce((s, x) => s + x[k], 0);

describe('categorías de activo', () => {
  it('cada categoría apunta a cuentas que existen en el catálogo base', () => {
    const codigos = new Set(CATALOGO_BASE.map((c) => c.codigo));
    for (const c of CATEGORIAS_ACTIVO) {
      expect(codigos.has(c.cuentaActivo), c.clave).toBe(true);
      expect(codigos.has(c.cuentaDeprecAcum), c.clave).toBe(true);
    }
  });
  it('solo el terreno no se deprecia', () => {
    expect(CATEGORIAS_ACTIVO.filter((c) => !c.deprecia).map((c) => c.clave)).toEqual(['terrenos']);
    expect(categoriaActivo('edificios')?.cuentaActivo).toBe('1204');
    expect(categoriaActivo('nada')).toBeNull();
  });
  it('las cuentas de ganancia y pérdida existen', () => {
    const por = new Map(CATALOGO_BASE.map((c) => [c.codigo, c]));
    expect(por.get('4105')?.tipo).toBe('ingreso');
    expect(por.get('6120')?.tipo).toBe('gasto');
  });
});

describe('calcularBaja: una unidad de varias', () => {
  // 30 butacas de RD$300,000 en total, con RD$90,000 depreciados.
  const estado = { costoVigenteCents: 30_000_000, acumuladaVigenteCents: 9_000_000, cantidadVigente: 30 };

  it('se lleva su parte proporcional del costo y de la depreciación', () => {
    const c = calcularBaja(estado, 1, 0);
    expect(c.costoBajaCents).toBe(1_000_000);
    expect(c.depreciacionBajaCents).toBe(300_000);
    expect(c.valorLibrosBajaCents).toBe(700_000);
    expect(c.esTotal).toBe(false);
    // Desechada sin cobrar: todo lo que valía en libros es pérdida.
    expect(c.resultadoCents).toBe(-700_000);
  });

  it('vendida por más de lo que valía da ganancia; por menos, pérdida', () => {
    expect(calcularBaja(estado, 1, 900_000).resultadoCents).toBe(200_000);
    expect(calcularBaja(estado, 1, 500_000).resultadoCents).toBe(-200_000);
    expect(calcularBaja(estado, 1, 700_000).resultadoCents).toBe(0);
  });

  it('dar de baja todas las que quedan se lleva exactamente todo, sin residuo de redondeo', () => {
    const raro = { costoVigenteCents: 1_000_001, acumuladaVigenteCents: 333_333, cantidadVigente: 3 };
    const c = calcularBaja(raro, 3, 0);
    expect(c.esTotal).toBe(true);
    expect(c.costoBajaCents).toBe(1_000_001);
    expect(c.depreciacionBajaCents).toBe(333_333);
  });

  it('bajas sucesivas de una en una suman el total sin perder ni inventar centavos', () => {
    let e = { costoVigenteCents: 1_000_001, acumuladaVigenteCents: 333_333, cantidadVigente: 3 };
    let costo = 0; let dep = 0;
    for (let i = 0; i < 3; i++) {
      const c = calcularBaja(e, 1, 0);
      costo += c.costoBajaCents; dep += c.depreciacionBajaCents;
      e = { costoVigenteCents: e.costoVigenteCents - c.costoBajaCents, acumuladaVigenteCents: e.acumuladaVigenteCents - c.depreciacionBajaCents, cantidadVigente: e.cantidadVigente - 1 };
    }
    expect(costo).toBe(1_000_001);
    expect(dep).toBe(333_333);
    expect(e.cantidadVigente).toBe(0);
  });

  it('rechaza unidades de más, cero, fraccionarias y precios negativos', () => {
    expect(() => calcularBaja(estado, 31, 0)).toThrow(BajaActivoError);
    expect(() => calcularBaja(estado, 0, 0)).toThrow(BajaActivoError);
    expect(() => calcularBaja(estado, 1.5, 0)).toThrow(BajaActivoError);
    expect(() => calcularBaja(estado, 1, -1)).toThrow(BajaActivoError);
  });

  it('la depreciación nunca pasa del costo de lo que sale', () => {
    const c = calcularBaja({ costoVigenteCents: 100, acumuladaVigenteCents: 500, cantidadVigente: 2 }, 1, 0);
    expect(c.depreciacionBajaCents).toBeLessThanOrEqual(c.costoBajaCents);
  });
});

describe('lineasAsientoBaja', () => {
  const estado = { costoVigenteCents: 30_000_000, acumuladaVigenteCents: 9_000_000, cantidadVigente: 30 };

  it.each([0, 500_000, 700_000, 900_000, 5_000_000])('cuadra con un precio de %i', (precio) => {
    const c = calcularBaja(estado, 1, precio);
    const lineas = lineasAsientoBaja(c, cuentas, 'Butaca');
    expect(suma(lineas, 'debeCents')).toBe(suma(lineas, 'haberCents'));
    expect(lineas.every((l) => (l.debeCents > 0) !== (l.haberCents > 0))).toBe(true);
  });

  it('desechada: debita depreciación y pérdida, acredita el activo', () => {
    const lineas = lineasAsientoBaja(calcularBaja(estado, 1, 0), cuentas, 'Butaca');
    expect(lineas.find((l) => l.cuentaId === 2)?.debeCents).toBe(300_000);
    expect(lineas.find((l) => l.cuentaId === 5)?.debeCents).toBe(700_000);
    expect(lineas.find((l) => l.cuentaId === 1)?.haberCents).toBe(1_000_000);
    expect(lineas.some((l) => l.cuentaId === 3 || l.cuentaId === 4)).toBe(false);
  });

  it('vendida con ganancia: cobra en caja o banco y reconoce la ganancia', () => {
    const lineas = lineasAsientoBaja(calcularBaja(estado, 1, 900_000), cuentas, 'Butaca');
    expect(lineas.find((l) => l.cuentaId === 3)?.debeCents).toBe(900_000);
    expect(lineas.find((l) => l.cuentaId === 4)?.haberCents).toBe(200_000);
    expect(lineas.some((l) => l.cuentaId === 5)).toBe(false);
  });

  it('con precio exige la cuenta donde entró el dinero', () => {
    expect(() => lineasAsientoBaja(calcularBaja(estado, 1, 900_000), { ...cuentas, cobro: null }, 'Butaca')).toThrow(/caja o banco/);
  });

  it('un activo sin depreciar no deja líneas en cero', () => {
    const c = calcularBaja({ costoVigenteCents: 100_000, acumuladaVigenteCents: 0, cantidadVigente: 1 }, 1, 0);
    const lineas = lineasAsientoBaja(c, cuentas, 'Terreno');
    expect(lineas.some((l) => l.cuentaId === 2)).toBe(false);
    expect(suma(lineas, 'debeCents')).toBe(suma(lineas, 'haberCents'));
  });
});

describe('calcularCuotasConBajas', () => {
  const activo = { costoCents: 12_000_000, valorResidualCents: 0, vidaUtilMeses: 120, fechaAdquisicion: '2026-01-15', cantidad: 10 };

  it('sin bajas es exactamente calcularCuotas', () => {
    expect(calcularCuotasConBajas(activo, [], '2026-06-01')).toEqual(calcularCuotas(activo, '2026-06-01'));
  });

  it('la cuota baja en proporción a las unidades que quedan, desde el mes siguiente a la baja', () => {
    const cuotas = calcularCuotasConBajas(activo, [{ fecha: '2026-03-10', unidades: 2 }], '2026-06-01');
    const por = new Map(cuotas.map((c) => [c.periodo, c.montoCents]));
    expect(por.get('2026-02-01')).toBe(100_000);   // 10 de 10
    expect(por.get('2026-03-01')).toBe(100_000);   // el mes de la baja se deprecia completo
    expect(por.get('2026-04-01')).toBe(80_000);    // 8 de 10
    expect(por.get('2026-06-01')).toBe(80_000);
  });

  it('con todas las unidades dadas de baja ya no hay cuotas', () => {
    const cuotas = calcularCuotasConBajas(activo, [{ fecha: '2026-03-10', unidades: 10 }], '2026-06-01');
    expect(cuotas.map((c) => c.periodo)).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('una ficha de una sola unidad no cambia', () => {
    const uno = { ...activo, cantidad: 1 };
    expect(calcularCuotasConBajas(uno, [{ fecha: '2026-03-10', unidades: 1 }], '2026-06-01')).toEqual(calcularCuotas(uno, '2026-06-01'));
  });
});

describe('fichasDeCompra', () => {
  const base = { productoId: null, cantidad: 1, costoCents: 100_000 };

  it('abre una ficha por cada línea de activo fijo, con su cantidad y su costo', () => {
    const f = fichasDeCompra([
      { ...base, descripcion: 'Papel', categoria: 'materiales' },
      { ...base, descripcion: 'Butacas', categoria: 'activo_fijo', cantidad: 30, costoCents: 4_500_000 },
      { ...base, descripcion: '  ', categoria: 'activo_fijo' },
    ]);
    expect(f).toHaveLength(2);
    expect(f[0]).toEqual({ linea: 1, nombre: 'Butacas', cantidad: 30, costoCents: 4_500_000 });
    expect(f[1].linea).toBe(2);
    expect(f[1].nombre).toBe('Activo fijo de una compra');
  });

  it('ignora mercancía de inventario y líneas sin costo', () => {
    expect(fichasDeCompra([
      { ...base, descripcion: 'x', categoria: 'activo_fijo', productoId: 9 },
      { ...base, descripcion: 'y', categoria: 'activo_fijo', costoCents: 0 },
    ])).toEqual([]);
  });

  it('una cantidad rara se vuelve 1', () => {
    expect(fichasDeCompra([{ ...base, descripcion: 'z', categoria: 'activo_fijo', cantidad: 0 }])[0].cantidad).toBe(1);
  });
});
