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
        //
        // Si la variante ya no existe (se borró después de la venta) NO se toma
        // en cuenta y la devolución entra al producto. Antes se saltaba el item:
        // la nota de crédito se emitía y la mercancía nunca volvía al inventario.
        let variantEfectiva: number | null = null;
        let stockAntes = prod.stock_actual;

        if (variantId) {
          const [variante] = await tx.execute<{ stock_actual: number }>(sql`
            SELECT stock_actual
            FROM product_variants
            WHERE id = ${variantId} AND product_id = ${productoId} AND team_id = ${teamId}
            FOR UPDATE
          `);
          if (variante) {
            variantEfectiva = variantId;
            stockAntes      = variante.stock_actual;
          } else {
            console.warn(
              `[inventario] variante ${variantId} no existe para el producto ${productoId} ` +
              `(team ${teamId}); la devolución entra a nivel de producto`,
            );
          }
        }

        const stockDespues = stockAntes + cantidadInt;

        if (variantEfectiva) {
          await tx.update(productVariants)
            .set({ stockActual: stockDespues, updatedAt: new Date() })
            .where(and(eq(productVariants.id, variantEfectiva), eq(productVariants.teamId, teamId)));

          await tx.update(products)
            .set({ stockActual: prod.stock_actual + cantidadInt, updatedAt: new Date() })
            .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));
        } else {
          await tx.update(products)
            .set({ stockActual: stockDespues, updatedAt: new Date() })
            .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));
        }

        await tx.insert(inventoryMovements).values({
          teamId,
          productoId,
          variantId: variantEfectiva,
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
          if (variantEfectiva) {
            // Opción B: restaurar el stock de la variante por almacén.
            await tx.execute(sql`
              INSERT INTO product_variant_almacen_stock (team_id, variant_id, almacen_id, stock_actual)
              VALUES (${teamId}, ${variantEfectiva}, ${almacenId},
                COALESCE((
                  SELECT stock_actual FROM product_variant_almacen_stock
                  WHERE variant_id = ${variantEfectiva} AND almacen_id = ${almacenId}
                ), 0) + ${cantidadInt}
              )
              ON CONFLICT (variant_id, almacen_id)
              DO UPDATE SET stock_actual = product_variant_almacen_stock.stock_actual + ${cantidadInt}
            `);
          } else {
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

          // El stock por almacén es la VERDAD; los otros dos niveles son sumas
          // denormalizadas. Antes cada nivel se decrementaba por su cuenta y
          // cada uno recortaba en 0 por separado: vender 5 de una variante con
          // 3 en el almacén dejaba los tres números distintos, sin forma de
          // saber cuál creer. Recalcularlos de la suma los mantiene exactos.
          if (variantEfectiva) {
            await tx.execute(sql`
              UPDATE product_variants pv
              SET stock_actual = COALESCE((
                    SELECT SUM(stock_actual) FROM product_variant_almacen_stock
                    WHERE variant_id = pv.id
                  ), 0),
                  updated_at = now()
              WHERE pv.id = ${variantEfectiva} AND pv.team_id = ${teamId}
            `);
            await tx.execute(sql`
              UPDATE products p
              SET stock_actual = COALESCE((
                    SELECT SUM(stock_actual) FROM product_variants
                    WHERE product_id = p.id AND activo = true
                  ), 0),
                  updated_at = now()
              WHERE p.id = ${productoId} AND p.team_id = ${teamId}
            `);
          }
        }
      });
    } catch (e) {
      console.error(`[restaurarInventario] producto=${productoId}`, e);
    }
  }
}
