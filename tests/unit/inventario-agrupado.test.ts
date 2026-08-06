import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El descuento y la devolución de inventario pasaron de abrir una transacción
 * por línea a hacerlo todo en una. Lo que hay que blindar de ese cambio es que
 * las líneas repetidas del mismo producto se sumen ANTES de leer el stock: en
 * el código viejo cada línea leía y escribía por su cuenta, y ahora una sola
 * lectura tiene que cubrir a todas.
 */

const capturado: { sql: string; params: unknown[] }[] = [];
const filasProductos: { id: number; stockActual: number; controlaInventario: boolean }[] = [];
const movimientosInsertados: unknown[][] = [];

vi.mock('@/lib/db/drizzle', () => {
  const constructorSelect = () => {
    const enc = {
      from: () => enc,
      where: () => enc,
      orderBy: () => enc,
      for: () => Promise.resolve(filasProductos),
    };
    return enc;
  };
  const tx = {
    select: constructorSelect,
    execute: (frag: unknown) => {
      capturado.push({ sql: String((frag as { queryChunks?: unknown }).queryChunks ?? frag), params: [] });
      return Promise.resolve([]);
    },
    insert: () => ({ values: (v: unknown[]) => { movimientosInsertados.push(v); return Promise.resolve(); } }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
  return {
    db: {
      transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});

import { descontarInventario } from '@/lib/inventario/descuento';
import { restaurarInventario } from '@/lib/inventario/devolucion';

beforeEach(() => {
  capturado.length = 0;
  filasProductos.length = 0;
  movimientosInsertados.length = 0;
});

describe('descontarInventario', () => {
  it('suma las líneas repetidas del mismo producto en un solo movimiento', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: true });

    await descontarInventario(1, 1, 100, 'E310000000001', [
      { productoId: 7, cantidadItem: 2, indicadorBienoServicio: 1 },
      { productoId: 7, cantidadItem: 3, indicadorBienoServicio: 1 },
    ]);

    expect(movimientosInsertados).toHaveLength(1);
    const movs = movimientosInsertados[0] as { cantidad: number; stockAntes: number; stockDespues: number }[];
    expect(movs).toHaveLength(1);
    // 2 + 3 en una sola línea, y el stock baja de 10 a 5 de una vez. Con una
    // transacción por línea el segundo movimiento habría partido de 8.
    expect(movs[0].cantidad).toBe(5);
    expect(movs[0].stockAntes).toBe(10);
    expect(movs[0].stockDespues).toBe(5);
  });

  it('nunca deja el stock por debajo de cero', async () => {
    filasProductos.push({ id: 7, stockActual: 1, controlaInventario: true });
    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, cantidadItem: 9, indicadorBienoServicio: 1 },
    ]);
    const movs = movimientosInsertados[0] as { stockDespues: number }[];
    expect(movs[0].stockDespues).toBe(0);
  });

  it('ignora los productos que no controlan inventario', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: false });
    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, cantidadItem: 2, indicadorBienoServicio: 1 },
    ]);
    expect(movimientosInsertados).toHaveLength(0);
  });

  it('no toca la base cuando la factura es solo de servicios', async () => {
    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, cantidadItem: 2, indicadorBienoServicio: 2 },
    ]);
    expect(movimientosInsertados).toHaveLength(0);
    expect(capturado).toHaveLength(0);
  });

  it('redondea hacia arriba las cantidades fraccionadas', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: true });
    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, cantidadItem: 1.2, indicadorBienoServicio: 1 },
    ]);
    const movs = movimientosInsertados[0] as { cantidad: number }[];
    expect(movs[0].cantidad).toBe(2);
  });
});

describe('restaurarInventario', () => {
  it('devuelve al stock la suma de las líneas repetidas', async () => {
    filasProductos.push({ id: 7, stockActual: 5, controlaInventario: true });

    await restaurarInventario(1, 1, 100, 'E1', [
      { productoId: 7, cantidadItem: 2, indicadorBienoServicio: 1 },
      { productoId: 7, cantidadItem: 3, indicadorBienoServicio: 1 },
    ]);

    const movs = movimientosInsertados[0] as { cantidad: number; stockDespues: number; esEntrada: boolean }[];
    expect(movs[0].cantidad).toBe(5);
    expect(movs[0].stockDespues).toBe(10);
    expect(movs[0].esEntrada).toBe(true);
  });
});
