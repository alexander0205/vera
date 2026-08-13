/**
 * Descuento automático de inventario post-emisión de e-CF.
 * Compartido entre /api/ecf/emitir y /api/facturas/[id]/emitir-ecf.
 *
 * Fire-and-forget: el caller usa .catch() para que un fallo aquí no
 * revierta un e-CF ya confirmado por DGII.
 */

import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

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

  // Una factura puede repetir el mismo producto en varias líneas; se suman
  // antes de tocar la base para no leer un stock que la línea anterior acaba
  // de cambiar. La clave incluye la variante: dos tallas del mismo producto
  // son dos conteos distintos y no se pueden sumar en uno solo.
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
    // Todo en UNA transacción. Antes se abría una por línea, así que una venta
    // de veinte productos costaba veinte BEGIN/COMMIT contra Neon, con la
    // latencia de red de cada uno.
    await db.transaction(async (tx) => {
      // FOR UPDATE sobre todas las filas de golpe: bloquea lo justo y evita que
      // dos ventas simultáneas del mismo producto lean el mismo stock. El orden
      // por id es deliberado — bloquear siempre en el mismo orden es lo que
      // evita los interbloqueos entre dos ventas que comparten productos.
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
              `(team ${teamId}); se descuenta a nivel de producto`,
            );
          }
        }

        calculados.push({
          productoId:   linea.productoId,
          variantId:    variantEfectiva,
          cantidad:     linea.cantidad,
          stockAntes,
          stockDespues: Math.max(0, stockAntes - linea.cantidad),
        });
      }

      if (calculados.length === 0) return;

      // El stock global del producto baja por TODAS sus líneas, tengan variante
      // o no: es la suma de las variantes más lo que no está variantizado.
      const bajaPorProducto = new Map<number, number>();
      for (const c of calculados) {
        bajaPorProducto.set(c.productoId, (bajaPorProducto.get(c.productoId) ?? 0) + c.cantidad);
      }
      const valores = sql.join(
        [...bajaPorProducto.entries()].map(
          ([id, baja]) => sql`(${id}::int, ${Math.max(0, (stockProducto.get(id) ?? 0) - baja)}::int)`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${products} AS p
        SET stock_actual = v.stock, updated_at = now()
        FROM (VALUES ${valores}) AS v(id, stock)
        WHERE p.id = v.id AND p.team_id = ${teamId}
      `);

      // Las variantes llevan su propio conteo.
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
          // NULL cuando la venta no trae almacén: se comporta como antes.
          almacenId: almacenId ?? null,
          teamId,
          productoId: c.productoId,
          variantId: c.variantId,
          tipo: 'VENTA' as const,
          cantidad: c.cantidad,
          esEntrada: false,
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
          // Va en dos pasos a propósito. Restar dentro de un ON CONFLICT obliga a
          // repetir la lista de cantidades en el DO UPDATE, porque ahí EXCLUDED
          // ya trae el valor calculado para la fila nueva y no la cantidad
          // original. Primero se asegura que la fila exista y después se resta.
          const enCero = sql.join(
            sinVariante.map((c) => sql`(${teamId}::int, ${c.productoId}::int, ${almacenId}::int, 0::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
            VALUES ${enCero}
            ON CONFLICT (product_id, almacen_id) DO NOTHING
          `);

          const aRestar = sql.join(
            sinVariante.map((c) => sql`(${c.productoId}::int, ${c.cantidad}::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE product_almacen_stock AS s
            SET stock_actual = GREATEST(0, s.stock_actual - v.cantidad)
            FROM (VALUES ${aRestar}) AS v(product_id, cantidad)
            WHERE s.product_id = v.product_id AND s.almacen_id = ${almacenId}
          `);
        }

        if (conVariante.length > 0) {
          // Opción B: para productos con variante la verdad por-almacén vive en
          // product_variant_almacen_stock (no en product_almacen_stock).
          const enCeroVar = sql.join(
            conVariante.map((c) => sql`(${teamId}::int, ${c.variantId}::int, ${almacenId}::int, 0::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            INSERT INTO product_variant_almacen_stock (team_id, variant_id, almacen_id, stock_actual)
            VALUES ${enCeroVar}
            ON CONFLICT (variant_id, almacen_id) DO NOTHING
          `);

          const aRestarVar = sql.join(
            conVariante.map((c) => sql`(${c.variantId}::int, ${c.cantidad}::int)`),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE product_variant_almacen_stock AS s
            SET stock_actual = GREATEST(0, s.stock_actual - v.cantidad)
            FROM (VALUES ${aRestarVar}) AS v(variant_id, cantidad)
            WHERE s.variant_id = v.variant_id AND s.almacen_id = ${almacenId}
          `);

          // El stock por almacén es la VERDAD; los otros dos niveles son sumas
          // denormalizadas. Antes cada nivel se decrementaba por su cuenta y
          // cada uno recortaba en 0 por separado: vender 5 de una variante con
          // 3 en el almacén dejaba los tres números distintos, sin forma de
          // saber cuál creer. Recalcularlos de la suma los mantiene exactos.
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
    console.error(`[descontarInventario] ecf=${ecfDocumentId} productos=${ids.join(',')}`, e);
  }
}
