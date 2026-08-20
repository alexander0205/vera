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
/**
 * Stock de cada variante, por id. Lo consulta el código con un SELECT sobre
 * `product_variants`; el mock responde desde aquí. Una variante ausente es
 * justamente el caso "la borraron entre la venta y la emisión".
 */
const stockVariantes = new Map<number, number>();

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
      // El fragmento de drizzle es una lista de trozos alternos: el texto viene
      // en objetos `StringChunk` (con `value: string[]`) y los parámetros van
      // como valores sueltos entre medias. Se separan porque el id de la
      // variante viaja como parámetro y nunca aparece dentro del SQL.
      const chunks = ((frag as { queryChunks?: unknown[] }).queryChunks ?? []);
      const esTexto = (c: unknown): c is { value: string[] } =>
        typeof c === 'object' && c !== null && Array.isArray((c as { value?: unknown }).value);
      const texto  = chunks.filter(esTexto).map((c) => c.value.join('')).join(' ');
      const params = chunks.filter((c) => !esTexto(c));
      capturado.push({ sql: texto, params });

      // El SELECT de la variante: su primer parámetro es el id que se busca.
      if (/product_variants/.test(texto) && /SELECT/i.test(texto)) {
        const id = Number(params[0]);
        return Promise.resolve(
          stockVariantes.has(id) ? [{ stock_actual: stockVariantes.get(id) }] : [],
        );
      }
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
  stockVariantes.clear();
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

  /**
   * Las variantes. Todo esto se comprobó a mano en el punto de venta —vender
   * una M y una L bajó cada talla por su lado— y hasta aquí no había una sola
   * prueba que lo sostuviera: el agrupado por `(producto, variante)` se podía
   * romper en un refactor y los tests seguirían en verde.
   */
  it('NO junta dos variantes del mismo producto', async () => {
    filasProductos.push({ id: 7, stockActual: 18, controlaInventario: true });
    stockVariantes.set(31, 10);   // M
    stockVariantes.set(42, 8);    // L

    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, variantId: 31, cantidadItem: 1, indicadorBienoServicio: 1 },
      { productoId: 7, variantId: 42, cantidadItem: 1, indicadorBienoServicio: 1 },
    ]);

    const movs = movimientosInsertados[0] as { variantId: number | null; cantidad: number; stockAntes: number; stockDespues: number }[];
    // Dos movimientos, no uno de cantidad 2: la M y la L son conteos distintos.
    expect(movs).toHaveLength(2);
    const m = movs.find((x) => x.variantId === 31)!;
    const l = movs.find((x) => x.variantId === 42)!;
    // Cada uno parte del stock de SU talla, no del total del producto (18).
    expect([m.stockAntes, m.stockDespues]).toEqual([10, 9]);
    expect([l.stockAntes, l.stockDespues]).toEqual([8, 7]);
  });

  it('sí junta dos líneas de la MISMA variante', async () => {
    filasProductos.push({ id: 7, stockActual: 18, controlaInventario: true });
    stockVariantes.set(31, 10);

    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, variantId: 31, cantidadItem: 2, indicadorBienoServicio: 1 },
      { productoId: 7, variantId: 31, cantidadItem: 3, indicadorBienoServicio: 1 },
    ]);

    const movs = movimientosInsertados[0] as { cantidad: number; stockAntes: number; stockDespues: number }[];
    expect(movs).toHaveLength(1);
    expect(movs[0].cantidad).toBe(5);
    // De 10 a 5 de una vez: si cada línea leyera por su cuenta, la segunda
    // habría partido de 8 y el stock final sería 5 por casualidad, no por
    // cálculo — con tres líneas ya no cuadraría.
    expect([movs[0].stockAntes, movs[0].stockDespues]).toEqual([10, 5]);
  });

  it('descuenta al producto cuando la variante ya no existe', async () => {
    filasProductos.push({ id: 7, stockActual: 18, controlaInventario: true });
    // Sin entrada en stockVariantes: la variante se borró entre la venta y la
    // emisión. Antes se saltaba el item entero y la salida no quedaba en
    // ninguna parte; ahora cae al producto y deja rastro.
    await descontarInventario(1, 1, 100, 'E1', [
      { productoId: 7, variantId: 999, cantidadItem: 2, indicadorBienoServicio: 1 },
    ]);

    const movs = movimientosInsertados[0] as { variantId: number | null; stockAntes: number; stockDespues: number }[];
    expect(movs).toHaveLength(1);
    expect(movs[0].variantId).toBeNull();
    expect([movs[0].stockAntes, movs[0].stockDespues]).toEqual([18, 16]);
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

  it('devuelve cada variante a SU talla', async () => {
    filasProductos.push({ id: 7, stockActual: 21, controlaInventario: true });
    stockVariantes.set(31, 14);
    stockVariantes.set(42, 7);

    // Anular la venta de una M y una L: cada talla recupera la suya. Si se
    // juntaran, volverían dos unidades a una sola talla y la otra quedaría
    // corta para siempre — y a diferencia del descuento, aquí el error regala
    // stock que no existe.
    await restaurarInventario(1, 1, 100, 'E1', [
      { productoId: 7, variantId: 31, cantidadItem: 1, indicadorBienoServicio: 1 },
      { productoId: 7, variantId: 42, cantidadItem: 1, indicadorBienoServicio: 1 },
    ]);

    const movs = movimientosInsertados[0] as { variantId: number | null; stockAntes: number; stockDespues: number }[];
    expect(movs).toHaveLength(2);
    expect(movs.find((x) => x.variantId === 31)!.stockDespues).toBe(15);
    expect(movs.find((x) => x.variantId === 42)!.stockDespues).toBe(8);
  });
});
