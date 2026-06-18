/**
 * Registro de entradas de inventario por compra.
 * Crea movimientos tipo ENTRADA directamente en DB sin pasar por la API.
 * Usado por /api/compras/local — fire-and-forget.
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ItemParaEntrada {
  productoId: number;
  cantidad:   number;
  almacenId?: number | null;
}

export async function registrarEntradas(
  teamId:   number,
  userId:   number,
  compraId: number,
  motivo:   string,
  items:    ItemParaEntrada[],
): Promise<void> {
  for (const item of items) {
    try {
      await db.transaction(async (tx) => {
        const [prod] = await tx.execute<{ stock_actual: number; controla_inventario: boolean }>(sql`
          SELECT stock_actual, controla_inventario
          FROM products
          WHERE id = ${item.productoId} AND team_id = ${teamId}
          FOR UPDATE
        `);

        if (!prod) return;

        const stockAntes   = prod.stock_actual;
        const stockDespues = stockAntes + item.cantidad;

        await tx.update(products)
          .set({ stockActual: stockDespues, updatedAt: new Date() })
          .where(and(eq(products.id, item.productoId), eq(products.teamId, teamId)));

        await tx.insert(inventoryMovements).values({
          teamId,
          productoId:  item.productoId,
          tipo:        'ENTRADA',
          cantidad:    item.cantidad,
          esEntrada:   true,
          stockAntes,
          stockDespues,
          motivo,
          createdBy:   userId,
        });

        if (item.almacenId) {
          await tx.execute(sql`
            INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
            VALUES (${teamId}, ${item.productoId}, ${item.almacenId},
              COALESCE((
                SELECT stock_actual FROM product_almacen_stock
                WHERE product_id = ${item.productoId} AND almacen_id = ${item.almacenId}
              ), 0) + ${item.cantidad}
            )
            ON CONFLICT (product_id, almacen_id)
            DO UPDATE SET stock_actual = product_almacen_stock.stock_actual + ${item.cantidad}
          `);
        }
      });
    } catch (e) {
      console.error(`[registrarEntradas] compra=${compraId} producto=${item.productoId}`, e);
    }
  }
}
