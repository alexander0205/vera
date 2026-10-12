/**
 * Registro de entradas de inventario por compra.
 * Crea movimientos tipo ENTRADA directamente en DB sin pasar por la API.
 * Usado por el registro de compras (lib/compras/registrar.ts).
 *
 * Con costo, además actualiza el costo del producto por promedio ponderado:
 * (existencia × costo anterior + cantidad × costo nuevo) ÷ existencia nueva.
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export interface ItemParaEntrada {
  productoId: number;
  cantidad:   number;
  almacenId?: number | null;
  /** Costo por unidad en centavos, con el ITBIS que no se adelanta. */
  costoUnitarioCents?: number | null;
}

/** Costo promedio ponderado. Con existencia en cero o negativa manda el costo nuevo. */
export function costoPromedio(stockAntes: number, costoAntes: number, cantidad: number, costoNuevo: number): number {
  if (cantidad <= 0) return costoAntes;
  if (stockAntes <= 0 || costoAntes <= 0) return Math.round(costoNuevo);
  return Math.round((stockAntes * costoAntes + cantidad * costoNuevo) / (stockAntes + cantidad));
}

export async function registrarEntradas(
  teamId:   number,
  userId:   number,
  compraId: number,
  motivo:   string,
  items:    ItemParaEntrada[],
): Promise<void> {
  if (items.length === 0) return;

  // Una compra puede traer el mismo producto en varias líneas (distintos lotes
  // o precios); se acumulan antes de tocar la base para no leer un stock que la
  // línea anterior acaba de mover.
  const porProducto = new Map<number, number>();
  // Lo que cuestan las unidades que traen costo, para el promedio ponderado.
  const costeadas = new Map<number, { cantidad: number; totalCents: number }>();
  // El almacén se lleva aparte porque cada línea puede ir a uno distinto.
  const porAlmacen = new Map<string, { productoId: number; almacenId: number; cantidad: number }>();

  for (const item of items) {
    porProducto.set(item.productoId, (porProducto.get(item.productoId) ?? 0) + item.cantidad);
    if (item.costoUnitarioCents && item.costoUnitarioCents > 0) {
      const c = costeadas.get(item.productoId) ?? { cantidad: 0, totalCents: 0 };
      c.cantidad += item.cantidad;
      c.totalCents += item.cantidad * item.costoUnitarioCents;
      costeadas.set(item.productoId, c);
    }
    if (item.almacenId) {
      const clave = `${item.productoId}:${item.almacenId}`;
      const acc = porAlmacen.get(clave)
        ?? { productoId: item.productoId, almacenId: item.almacenId, cantidad: 0 };
      acc.cantidad += item.cantidad;
      porAlmacen.set(clave, acc);
    }
  }
  const ids = [...porProducto.keys()];

  try {
    // Una sola transacción para toda la compra: antes se abría una por línea, y
    // una factura de proveedor con treinta productos costaba treinta
    // BEGIN/COMMIT contra la base.
    await db.transaction(async (tx) => {
      // Bloqueo en orden de id, que es lo que evita interbloquearse con otra
      // operación que toque los mismos productos.
      const filas = await tx
        .select({ id: products.id, stockActual: products.stockActual, costo: products.costo })
        .from(products)
        .where(and(eq(products.teamId, teamId), inArray(products.id, ids)))
        .orderBy(products.id)
        .for('update');

      if (filas.length === 0) return;

      const calculados = filas.map((f) => {
        const cantidad = porProducto.get(f.id)!;
        const costeada = costeadas.get(f.id);
        return {
          id: f.id,
          cantidad,
          stockAntes: f.stockActual,
          stockDespues: f.stockActual + cantidad,
          costo: costeada
            ? costoPromedio(f.stockActual, f.costo, costeada.cantidad, costeada.totalCents / costeada.cantidad)
            : f.costo,
        };
      });

      const valores = sql.join(
        calculados.map((c) => sql`(${c.id}::int, ${c.stockDespues}::int, ${c.costo}::int)`),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${products} AS p
        SET stock_actual = v.stock, costo = v.costo, updated_at = now()
        FROM (VALUES ${valores}) AS v(id, stock, costo)
        WHERE p.id = v.id AND p.team_id = ${teamId}
      `);

      await tx.insert(inventoryMovements).values(
        calculados.map((c) => ({
          teamId,
          productoId: c.id,
          tipo: 'ENTRADA' as const,
          cantidad: c.cantidad,
          esEntrada: true,
          stockAntes: c.stockAntes,
          stockDespues: c.stockDespues,
          motivo,
          createdBy: userId,
        })),
      );

      // Stock por almacén: solo de las líneas que traen almacén, y solo de los
      // productos que existían.
      const existentes = new Set(calculados.map((c) => c.id));
      const conAlmacen = [...porAlmacen.values()].filter((a) => existentes.has(a.productoId));
      if (conAlmacen.length > 0) {
        // Igual que en el descuento: primero se garantiza la fila y después se
        // suma, porque dentro de un ON CONFLICT no se tiene a mano la cantidad
        // original.
        const enCero = sql.join(
          conAlmacen.map((a) => sql`(${teamId}::int, ${a.productoId}::int, ${a.almacenId}::int, 0::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
          VALUES ${enCero}
          ON CONFLICT (product_id, almacen_id) DO NOTHING
        `);

        const aSumar = sql.join(
          conAlmacen.map((a) => sql`(${a.productoId}::int, ${a.almacenId}::int, ${a.cantidad}::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE product_almacen_stock AS s
          SET stock_actual = s.stock_actual + v.cantidad
          FROM (VALUES ${aSumar}) AS v(product_id, almacen_id, cantidad)
          WHERE s.product_id = v.product_id AND s.almacen_id = v.almacen_id
        `);
      }
    });
  } catch (e) {
    console.error(`[registrarEntradas] compra=${compraId} productos=${ids.join(',')}`, e);
  }
}

/**
 * Deshace las entradas de una compra anulada: resta lo que entró, sin bajar de
 * cero, y deja un movimiento AJUSTE_SALIDA con el motivo. El costo promedio no
 * se recalcula hacia atrás: sería inventar un costo que nadie pagó.
 */
export async function revertirEntradas(
  teamId: number,
  userId: number,
  motivo: string,
  items: ItemParaEntrada[],
): Promise<void> {
  if (items.length === 0) return;
  const porProducto = new Map<number, number>();
  const porAlmacen = new Map<string, { productoId: number; almacenId: number; cantidad: number }>();
  for (const item of items) {
    porProducto.set(item.productoId, (porProducto.get(item.productoId) ?? 0) + item.cantidad);
    if (item.almacenId) {
      const clave = `${item.productoId}:${item.almacenId}`;
      const acc = porAlmacen.get(clave) ?? { productoId: item.productoId, almacenId: item.almacenId, cantidad: 0 };
      acc.cantidad += item.cantidad;
      porAlmacen.set(clave, acc);
    }
  }
  const ids = [...porProducto.keys()];

  await db.transaction(async (tx) => {
    const filas = await tx
      .select({ id: products.id, stockActual: products.stockActual })
      .from(products)
      .where(and(eq(products.teamId, teamId), inArray(products.id, ids)))
      .orderBy(products.id)
      .for('update');
    if (filas.length === 0) return;

    const calculados = filas.map((f) => {
      const cantidad = porProducto.get(f.id)!;
      return { id: f.id, cantidad, stockAntes: f.stockActual, stockDespues: Math.max(0, f.stockActual - cantidad) };
    });
    const valores = sql.join(calculados.map((c) => sql`(${c.id}::int, ${c.stockDespues}::int)`), sql`, `);
    await tx.execute(sql`
      UPDATE ${products} AS p
      SET stock_actual = v.stock, updated_at = now()
      FROM (VALUES ${valores}) AS v(id, stock)
      WHERE p.id = v.id AND p.team_id = ${teamId}
    `);
    await tx.insert(inventoryMovements).values(
      calculados.map((c) => ({
        teamId,
        productoId: c.id,
        tipo: 'AJUSTE_SALIDA' as const,
        cantidad: c.cantidad,
        esEntrada: false,
        stockAntes: c.stockAntes,
        stockDespues: c.stockDespues,
        motivo,
        createdBy: userId,
      })),
    );

    const existentes = new Set(calculados.map((c) => c.id));
    const conAlmacen = [...porAlmacen.values()].filter((a) => existentes.has(a.productoId));
    if (conAlmacen.length > 0) {
      const aRestar = sql.join(
        conAlmacen.map((a) => sql`(${a.productoId}::int, ${a.almacenId}::int, ${a.cantidad}::int)`),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE product_almacen_stock AS s
        SET stock_actual = greatest(0, s.stock_actual - v.cantidad)
        FROM (VALUES ${aRestar}) AS v(product_id, almacen_id, cantidad)
        WHERE s.product_id = v.product_id AND s.almacen_id = v.almacen_id
      `);
    }
  });
}
