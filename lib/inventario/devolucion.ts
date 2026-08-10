/**
 * Restauración de inventario al anular un e-CF.
 * Espejo de descontarInventario: incrementa stock e inserta movimiento DEVOLUCION.
 *
 * Fire-and-forget: el caller usa .catch() — un fallo aquí no revierte la anulación
 * ya confirmada. Solo se llama para documentos no-borrador (borrador nunca
 * decrementó stock).
 */

import { db } from '@/lib/db/drizzle';
import { products, productVariants, inventoryMovements } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ItemParaDevolucion {
  productoId?:             number | null;
  // Variante devuelta (opcional). Espejo del descuento: si viene, restaura el
  // stock de la variante y el global del producto en paralelo.
  variantId?:              number | null;
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
    const variantId  = item.variantId ?? null;
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

        // Con variante: se restaura el stock de la variante y, en paralelo, el
        // stock global del producto (que guarda la suma).
        let stockAntes:   number;
        let stockDespues: number;
        if (variantId) {
          const [variante] = await tx.execute<{ stock_actual: number }>(sql`
            SELECT stock_actual
            FROM product_variants
            WHERE id = ${variantId} AND product_id = ${productoId} AND team_id = ${teamId}
            FOR UPDATE
          `);
          if (!variante) return; // variante inexistente → no tocar nada
          stockAntes   = variante.stock_actual;
          stockDespues = stockAntes + cantidadInt;

          await tx.update(productVariants)
            .set({ stockActual: stockDespues, updatedAt: new Date() })
            .where(and(eq(productVariants.id, variantId), eq(productVariants.teamId, teamId)));

          await tx.update(products)
            .set({ stockActual: prod.stock_actual + cantidadInt, updatedAt: new Date() })
            .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));
        } else {
          stockAntes   = prod.stock_actual;
          stockDespues = stockAntes + cantidadInt;

          await tx.update(products)
            .set({ stockActual: stockDespues, updatedAt: new Date() })
            .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));
        }

        await tx.insert(inventoryMovements).values({
          teamId,
          productoId,
          variantId,
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
