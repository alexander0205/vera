// tests/unit/facturar-debe-migracion.test.ts
import { describe, it, expect, vi } from 'vitest';

// Solo se prueban las piezas puras: la base no hace falta.
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));

import { agruparPorMes, nombreMes } from '@/lib/administracion-escolar/facturar-debe-migracion';

const cargo = (id: number, mes: number | null, anio: number | null = 2026) =>
  ({ id, mes, anio, saldoCentavos: 500_000, fechaVencimiento: mes ? `2026-${String(mes).padStart(2, '0')}-29` : null });

describe('facturar los «Debe todo» de la migración', () => {
  it('lo de un mismo mes va en una factura; cada mes en la suya', () => {
    const grupos = agruparPorMes([cargo(1, 8), cargo(2, 9), cargo(3, 8), cargo(4, 10)]);
    expect(grupos.map((g) => g.map((c) => c.id))).toEqual([[1, 3], [2], [4]]);
  });

  it('el mismo mes de otro año es otra factura', () => {
    const grupos = agruparPorMes([cargo(1, 1, 2026), cargo(2, 1, 2027)]);
    expect(grupos).toHaveLength(2);
  });

  it('cada pago único va solo', () => {
    const grupos = agruparPorMes([cargo(1, null), cargo(2, null), cargo(3, 8)]);
    expect(grupos.map((g) => g.map((c) => c.id))).toEqual([[1], [2], [3]]);
  });

  it('nombra el mes como en la pantalla', () => {
    expect(nombreMes({ mes: 8, anio: 2026 })).toBe('Agosto 2026');
    expect(nombreMes({ mes: null, anio: null })).toBe('Pago único');
  });
});
