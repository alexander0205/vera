/**
 * Descuento automático de inventario post-emisión de e-CF.
 * Compartido entre /api/ecf/emitir y /api/facturas/[id]/emitir-ecf.
 *
 * Fire-and-forget: el caller usa .catch() para que un fallo aquí no
 * revierta un e-CF ya confirmado por DGII.
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ItemParaDescuento {
  productoId?:             number | null;
  cantidadItem:            number;
  indicadorBienoServicio?: 1 | 2;
}

export async function descontarInventario(
  teamId:        number,
  userId:        number,
  ecfDocumentId: number,
  encf:          string,
  items:         ItemParaDescuento[],
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
        const stockDespues = Math.max(0, stockAntes - cantidadInt);

        await tx.update(products)
          .set({ stockActual: stockDespues, updatedAt: new Date() })
          .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));

        await tx.insert(inventoryMovements).values({
          // NULL cuando la venta no trae almacén: se comporta como antes.
          almacenId: almacenId ?? null,
          teamId,
          productoId,
          tipo:           'VENTA',
          cantidad:       cantidadInt,
          esEntrada:      false,
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
              GREATEST(0, COALESCE((
                SELECT stock_actual FROM product_almacen_stock
                WHERE product_id = ${productoId} AND almacen_id = ${almacenId}
              ), 0) - ${cantidadInt})
            )
            ON CONFLICT (product_id, almacen_id)
            DO UPDATE SET stock_actual = GREATEST(0, product_almacen_stock.stock_actual - ${cantidadInt})
          `);
        }
      });
    } catch (e) {
      console.error(`[descontarInventario] producto=${productoId}`, e);
    }
  }
}
