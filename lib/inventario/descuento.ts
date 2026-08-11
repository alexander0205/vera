/**
 * Descuento automático de inventario post-emisión de e-CF.
 * Compartido entre /api/ecf/emitir y /api/facturas/[id]/emitir-ecf.
 *
 * Fire-and-forget: el caller usa .catch() para que un fallo aquí no
 * revierta un e-CF ya confirmado por DGII.
 */

import { db } from '@/lib/db/drizzle';
import { products, productVariants, inventoryMovements } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ItemParaDescuento {
  productoId?:             number | null;
  // Variante vendida (opcional). Si viene, el descuento pega al stock de la
  // variante; el stock global del producto se ajusta en paralelo para que la
  // suma siga cuadrando en listados y alertas.
  variantId?:              number | null;
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

        // Con variante: el conteo real es el de la variante. Se baja su stock y,
        // en paralelo, el stock global del producto (que guarda la suma) para que
        // los listados y alertas sigan cuadrando.
        //
        // La variante puede no existir: borrada, de otro producto, o un id
        // inválido. En ese caso NO se toma en cuenta y el descuento cae al
        // producto, que es lo que se vendió. Antes se saltaba el item entero —
        // la venta pasaba, el inventario no se movía y no quedaba rastro.
        //
        // Consecuencia asumida: si el producto TIENE variantes, su total deja de
        // cuadrar con la suma de ellas (no sabemos a cuál cargarle la salida).
        // Se prefiere eso a perder el movimiento; queda el warning y la fila en
        // inventory_movements para rastrearlo. Con validarVariantes en
        // /api/ecf/emitir este camino solo se alcanza si la variante se borró
        // entre la venta y la emisión.
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
              `(team ${teamId}); se descuenta a nivel de producto`,
            );
          }
        }

        const stockDespues = Math.max(0, stockAntes - cantidadInt);

        if (variantEfectiva) {
          await tx.update(productVariants)
            .set({ stockActual: stockDespues, updatedAt: new Date() })
            .where(and(eq(productVariants.id, variantEfectiva), eq(productVariants.teamId, teamId)));

          // Stock global del producto = suma de variantes; bajarlo en paralelo.
          await tx.update(products)
            .set({ stockActual: Math.max(0, prod.stock_actual - cantidadInt), updatedAt: new Date() })
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
          if (variantEfectiva) {
            // Opción B: para productos con variante la verdad por-almacén vive en
            // product_variant_almacen_stock (no en product_almacen_stock).
            await tx.execute(sql`
              INSERT INTO product_variant_almacen_stock (team_id, variant_id, almacen_id, stock_actual)
              VALUES (${teamId}, ${variantEfectiva}, ${almacenId},
                GREATEST(0, COALESCE((
                  SELECT stock_actual FROM product_variant_almacen_stock
                  WHERE variant_id = ${variantEfectiva} AND almacen_id = ${almacenId}
                ), 0) - ${cantidadInt})
              )
              ON CONFLICT (variant_id, almacen_id)
              DO UPDATE SET stock_actual = GREATEST(0, product_variant_almacen_stock.stock_actual - ${cantidadInt})
            `);
          } else {
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
      console.error(`[descontarInventario] producto=${productoId}`, e);
    }
  }
}
