/**
 * Restauración de inventario al anular un e-CF.
 * Espejo de descontarInventario: incrementa stock e inserta movimiento DEVOLUCION.
 *
 * Fire-and-forget: el caller usa .catch() — un fallo aquí no revierte la anulación
 * ya confirmada. Solo se llama para documentos no-borrador (borrador nunca
 * decrementó stock).
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ItemParaDevolucion {
  productoId?:             number | null;
  cantidadItem:            number;
  indicadorBienoServicio?: 1 | 2;
}

export async function restaurarInventario(
  teamId:        number,
  userId:        number,
  ecfDocumentId: number,
  encf:          string,
  items:         ItemParaDevolucion[],
  almacenId?:    number | null,
): Promise<void> {
  const bienesConId = items.filter(
    (i) => i.indicadorBienoServicio === 1 && i.productoId && i.productoId > 0,
  );
  if (bienesConId.length === 0) return;

  for (const item of bienesConId) {
    const productoId = item.productoId!;
    try {
      await db.transaction(async (tx) => {
        const [prod] = await tx.execute<{ stock_actual: number; controla_inventario: boolean }>(sql`
          SELECT stock_actual, controla_inventario
          FROM products
          WHERE id = ${productoId} AND team_id = ${teamId}
          FOR UPDATE
        `);

        if (!prod || !prod.controla_inventario) return;

        const cantidadInt  = Math.ceil(item.cantidadItem);
        const stockAntes   = prod.stock_actual;
        const stockDespues = stockAntes + cantidadInt;

        await tx.update(products)
          .set({ stockActual: stockDespues, updatedAt: new Date() })
          .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));

        await tx.insert(inventoryMovements).values({
          teamId,
          productoId,
          tipo:           'DEVOLUCION',
          cantidad:       cantidadInt,
          esEntrada:      true,
          stockAntes,
          stockDespues,
          referenciaId:   ecfDocumentId,
          referenciaEncf: encf,
          createdBy:      userId,
        });

        if (almacenId) {
          await tx.execute(sql`
            INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
            VALUES (${teamId}, ${productoId}, ${almacenId},
              COALESCE((
                SELECT stock_actual FROM product_almacen_stock
                WHERE product_id = ${productoId} AND almacen_id = ${almacenId}
              ), 0) + ${cantidadInt}
            )
            ON CONFLICT (product_id, almacen_id)
            DO UPDATE SET stock_actual = product_almacen_stock.stock_actual + ${cantidadInt}
          `);
        }
      });
    } catch (e) {
      console.error(`[restaurarInventario] producto=${productoId}`, e);
    }
  }
}
