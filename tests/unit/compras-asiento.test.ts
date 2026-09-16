import { describe, it, expect } from 'vitest';
import { partidasAsientoCompra, repartir, type ParametrosAsientoCompra } from '@/lib/compras/asiento-compra';
import { costoPromedio } from '@/lib/inventario/entrada';

const cuadra = (lineas: { debeCents: number; haberCents: number }[]) =>
  lineas.reduce((s, l) => s + l.debeCents, 0) === lineas.reduce((s, l) => s + l.haberCents, 0);

const base: ParametrosAsientoCompra = {
  bases: [
    { cuentaId: 1105, baseCents: 300_000, descripcion: 'Resma papel' },
    { cuentaId: 6110, baseCents: 1_000_000, descripcion: 'Honorarios' },
  ],
  itbisFacturadoCents: 234_000, itbisAlCostoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
  itbisRetenidoCents: 0, isrRetenidoCents: 0, esContado: false,
  cuentas: { itbisAdelantado: 1104, itbisRetenido: 2113, isrRetenido: 2114, contrapartida: 2101 },
};

describe('reparto', () => {
  it('suma exacta con el residuo repartido', () => {
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartir(1, [300, 700])).toEqual([0, 1]);
    expect(repartir(0, [5, 5])).toEqual([0, 0]);
    expect(repartir(10, [0, 0])).toEqual([10, 0]);
  });
});

describe('asiento de compra', () => {
  it('a crédito con ITBIS adelantado', () => {
    const l = partidasAsientoCompra(base);
    expect(Array.isArray(l)).toBe(true);
    if (!Array.isArray(l)) return;
    expect(l).toEqual([
      { cuentaId: 1105, debeCents: 300_000, haberCents: 0, descripcion: 'Resma papel' },
      { cuentaId: 6110, debeCents: 1_000_000, haberCents: 0, descripcion: 'Honorarios' },
      { cuentaId: 1104, debeCents: 234_000, haberCents: 0, descripcion: 'ITBIS adelantado (crédito fiscal)' },
      { cuentaId: 2101, debeCents: 0, haberCents: 1_534_000, descripcion: 'Deuda con el proveedor' },
    ]);
    expect(cuadra(l)).toBe(true);
  });

  it('honorarios a persona física: retenciones al pasivo y neto al banco', () => {
    const l = partidasAsientoCompra({
      ...base, bases: [{ cuentaId: 6110, baseCents: 1_000_000, descripcion: 'Honorarios' }],
      itbisFacturadoCents: 180_000, itbisRetenidoCents: 180_000, isrRetenidoCents: 150_000, esContado: true,
      cuentas: { ...base.cuentas, contrapartida: 1102 },
    });
    if (!Array.isArray(l)) throw new Error(l.motivo);
    expect(l.find((x) => x.cuentaId === 2113)?.haberCents).toBe(180_000);
    expect(l.find((x) => x.cuentaId === 2114)?.haberCents).toBe(150_000);
    expect(l.find((x) => x.cuentaId === 1102)).toMatchObject({ haberCents: 850_000, descripcion: 'Pago al proveedor' });
    expect(cuadra(l)).toBe(true);
  });

  it('lo que no se adelanta va al costo de cada línea, en proporción', () => {
    const l = partidasAsientoCompra({ ...base, itbisAlCostoCents: 234_000, propinaCents: 130_000 });
    if (!Array.isArray(l)) throw new Error(l.motivo);
    expect(l.find((x) => x.cuentaId === 1105)?.debeCents).toBe(300_000 + 84_000);
    expect(l.find((x) => x.cuentaId === 6110)?.debeCents).toBe(1_000_000 + 280_000);
    expect(l.find((x) => x.cuentaId === 1104)).toBeUndefined();
    expect(cuadra(l)).toBe(true);
  });

  it('dos líneas de la misma cuenta salen en una', () => {
    const l = partidasAsientoCompra({ ...base, bases: [
      { cuentaId: 6114, baseCents: 1_001, descripcion: 'Papel' },
      { cuentaId: 6114, baseCents: 2_002, descripcion: 'Tinta' },
    ], itbisFacturadoCents: 541, itbisAlCostoCents: 541 });
    if (!Array.isArray(l)) throw new Error(l.motivo);
    expect(l[0]).toEqual({ cuentaId: 6114, debeCents: 3_544, haberCents: 0, descripcion: 'Papel, Tinta' });
    expect(cuadra(l)).toBe(true);
  });

  it('sin cuenta de retenciones no se inventa una', () => {
    expect(partidasAsientoCompra({ ...base, isrRetenidoCents: 10, cuentas: { ...base.cuentas, isrRetenido: null } }))
      .toEqual({ motivo: 'sin-cuenta-retenciones-por-pagar' });
    expect(partidasAsientoCompra({ ...base, cuentas: { ...base.cuentas, itbisAdelantado: null } }))
      .toEqual({ motivo: 'sin-cuenta-itbis-adelantado' });
  });
});

describe('costo promedio ponderado', () => {
  it('pondera la existencia con lo que entra', () => {
    expect(costoPromedio(10, 10_000, 10, 12_000)).toBe(11_000);
    expect(costoPromedio(0, 10_000, 5, 12_000)).toBe(12_000);
    expect(costoPromedio(-3, 10_000, 5, 12_000)).toBe(12_000);
    expect(costoPromedio(4, 0, 4, 9_000)).toBe(9_000);
  });
});

describe('gasto propio (e43/e47/e41) con retención', () => {
  it('pago al exterior: todo al gasto, ISR retenido al pasivo, neto a la caja', () => {
    const l = partidasAsientoCompra({
      bases: [{ cuentaId: 6110, baseCents: 500_000, descripcion: 'Servicios y mantenimiento' }],
      itbisFacturadoCents: 0, itbisAlCostoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
      itbisRetenidoCents: 0, isrRetenidoCents: 135_000, esContado: true,
      cuentas: { itbisAdelantado: null, itbisRetenido: null, isrRetenido: 2114, contrapartida: 1101 },
    });
    if (!Array.isArray(l)) throw new Error(l.motivo);
    expect(l).toEqual([
      { cuentaId: 6110, debeCents: 500_000, haberCents: 0, descripcion: 'Servicios y mantenimiento' },
      { cuentaId: 2114, debeCents: 0, haberCents: 135_000, descripcion: 'ISR retenido al proveedor (IR-17)' },
      { cuentaId: 1101, debeCents: 0, haberCents: 365_000, descripcion: 'Pago al proveedor' },
    ]);
  });

  it('gasto menor con ITBIS: el ITBIS no se adelanta y va al gasto', () => {
    const l = partidasAsientoCompra({
      bases: [{ cuentaId: 6113, baseCents: 1_000, descripcion: 'Transporte y combustible' }],
      itbisFacturadoCents: 180, itbisAlCostoCents: 180, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
      itbisRetenidoCents: 0, isrRetenidoCents: 0, esContado: true,
      cuentas: { itbisAdelantado: null, itbisRetenido: null, isrRetenido: null, contrapartida: 1101 },
    });
    if (!Array.isArray(l)) throw new Error(l.motivo);
    expect(l.map((x) => [x.cuentaId, x.debeCents, x.haberCents])).toEqual([[6113, 1_180, 0], [1101, 0, 1_180]]);
  });
});
