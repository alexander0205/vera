/**
 * Restauración de inventario al anular un e-CF (o su nota de crédito).
 * Espejo de lib/inventario/descuento.ts.
 *
 * Fire-and-forget: el caller usa .catch() para que un fallo aquí no
 * revierta una anulación ya confirmada.
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

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

  // Se acumulan las líneas repetidas del mismo producto antes de tocar la base.
  // La clave lleva la variante: dos tallas del mismo producto son dos conteos.
  const porLinea = new Map<string, { productoId: number; variantId: number | null; cantidad: number }>();
  for (const item of bienesConId) {
    const productoId = item.productoId!;
    const variantId  = item.variantId ?? null;
    const clave      = `${productoId}:${variantId ?? 0}`;
    const previo     = porLinea.get(clave);
    const cantidad   = Math.ceil(item.cantidadItem);
    if (previo) previo.cantidad += cantidad;
    else porLinea.set(clave, { productoId, variantId, cantidad });
  }
  const agrupadas = [...porLinea.values()];
  const ids = [...new Set(agrupadas.map((a) => a.productoId))];

  try {
    // Toda la anulación en una transacción, igual que su espejo: antes se abría
    // una por línea.
    await db.transaction(async (tx) => {
      const filas = await tx
        .select({
          id: products.id,
          stockActual: products.stockActual,
          controlaInventario: products.controlaInventario,
        })
        .from(products)
        .where(and(eq(products.teamId, teamId), inArray(products.id, ids)))
        .orderBy(products.id)
        .for('update');

      const conControl = filas.filter((f) => f.controlaInventario);
      if (conControl.length === 0) return;
      const stockProducto = new Map(conControl.map((f) => [f.id, f.stockActual]));

      // Si la variante ya no existe (se borró después de la venta) NO se toma
      // en cuenta y la devolución entra al producto. Antes se saltaba el item:
      // la nota de crédito se emitía y la mercancía nunca volvía al inventario.
      const calculados: {
        productoId: number;
        variantId: number | null;
        cantidad: number;
        stockAntes: number;
        stockDespues: number;
      }[] = [];

      for (const linea of agrupadas) {
        if (!stockProducto.has(linea.productoId)) continue;   // no controla inventario

        let variantEfectiva: number | null = null;
        let stockAntes = stockProducto.get(linea.productoId)!;

        if (linea.variantId) {
          const [variante] = await tx.execute<{ stock_actual: number }>(sql`
            SELECT stock_actual
            FROM product_variants
            WHERE id = ${linea.variantId} AND product_id = ${linea.productoId} AND team_id = ${teamId}
            FOR UPDATE
          `);
          if (variante) {
            variantEfectiva = linea.variantId;
            stockAntes      = variante.stock_actual;
          } else {
            console.warn(
              `[inventario] variante ${linea.variantId} no existe para el producto ${linea.productoId} ` +
              `(team ${teamId}); la devolución entra a nivel de producto`,
            );
          }
        }

        calculados.push({
          productoId:   linea.productoId,
          variantId:    variantEfectiva,
          cantidad:     linea.cantidad,
          stockAntes,
          stockDespues: stockAntes + linea.cantidad,
        });
      }

      if (calculados.length === 0) return;

      const subePorProducto = new Map<number, number>();
      for (const c of calculados) {
        subePorProducto.set(c.productoId, (subePorProducto.get(c.productoId) ?? 0) + c.cantidad);
      }
      const valores = sql.join(
        [...subePorProducto.entries()].map(
          ([id, sube]) => sql`(${id}::int, ${(stockProducto.get(id) ?? 0) + sube}::int)`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${products} AS p
        SET stock_actual = v.stock, updated_at = now()
        FROM (VALUES ${valores}) AS v(id, stock)
        WHERE p.id = v.id AND p.team_id = ${teamId}
      `);

      const conVariante = calculados.filter((c) => c.variantId);
      if (conVariante.length > 0) {
        const variantes = sql.join(
          conVariante.map((c) => sql`(${c.variantId}::int, ${c.stockDespues}::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE product_variants AS pv
          SET stock_actual = v.stock, updated_at = now()
          FROM (VALUES ${variantes}) AS v(id, stock)
          WHERE pv.id = v.id AND pv.team_id = ${teamId}
        `);
      }

      await tx.insert(inventoryMovements).values(
        calculados.map((c) => ({
          teamId,
          productoId: c.productoId,
          variantId: c.variantId,
          tipo: 'DEVOLUCION' as const,
          cantidad: c.cantidad,
          esEntrada: true,
          stockAntes: c.stockAntes,
          stockDespues: c.stockDespues,
          referenciaId: ecfDocumentId,
          referenciaEncf: encf,
          createdBy: userId,
        })),
      );

      if (almacenId) {
        const sinVariante = calculados.filter((c) => !c.variantId);

        if (sinVariante.length > 0) {
          const enCero = sql.join(
            sinVariante.map((c) => sql`(${teamId}::int, ${c.productoId}::int, ${almacenId}::int, 0::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
            VALUES ${enCero}
            ON CONFLICT (product_id, almacen_id) DO NOTHING
          `);

          const aSumar = sql.join(
            sinVariante.map((c) => sql`(${c.productoId}::int, ${c.cantidad}::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE product_almacen_stock AS s
            SET stock_actual = s.stock_actual + v.cantidad
            FROM (VALUES ${aSumar}) AS v(product_id, cantidad)
            WHERE s.product_id = v.product_id AND s.almacen_id = ${almacenId}
          `);
        }

        if (conVariante.length > 0) {
          // Opción B: restaurar el stock de la variante por almacén.
          const enCeroVar = sql.join(
            conVariante.map((c) => sql`(${teamId}::int, ${c.variantId}::int, ${almacenId}::int, 0::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            INSERT INTO product_variant_almacen_stock (team_id, variant_id, almacen_id, stock_actual)
            VALUES ${enCeroVar}
            ON CONFLICT (variant_id, almacen_id) DO NOTHING
          `);

          const aSumarVar = sql.join(
            conVariante.map((c) => sql`(${c.variantId}::int, ${c.cantidad}::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE product_variant_almacen_stock AS s
            SET stock_actual = s.stock_actual + v.cantidad
            FROM (VALUES ${aSumarVar}) AS v(variant_id, cantidad)
            WHERE s.variant_id = v.variant_id AND s.almacen_id = ${almacenId}
          `);

          // El stock por almacén es la VERDAD; los otros dos niveles son sumas
          // denormalizadas. Recalcularlos de la suma los mantiene exactos.
          const idsVariantes = sql.join(conVariante.map((c) => sql`${c.variantId}::int`), sql`, `);
          await tx.execute(sql`
            UPDATE product_variants pv
            SET stock_actual = COALESCE((
                  SELECT SUM(stock_actual) FROM product_variant_almacen_stock
                  WHERE variant_id = pv.id
                ), 0),
                updated_at = now()
            WHERE pv.id IN (${idsVariantes}) AND pv.team_id = ${teamId}
          `);

          const idsConVariante = sql.join(
            [...new Set(conVariante.map((c) => c.productoId))].map((id) => sql`${id}::int`),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE products p
            SET stock_actual = COALESCE((
                  SELECT SUM(stock_actual) FROM product_variants
                  WHERE product_id = p.id AND activo = true
                ), 0),
                updated_at = now()
            WHERE p.id IN (${idsConVariante}) AND p.team_id = ${teamId}
          `);
        }
      }
    });
  } catch (e) {
    console.error(`[restaurarInventario] ecf=${ecfDocumentId} productos=${ids.join(',')}`, e);
  }
}
