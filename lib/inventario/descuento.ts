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
  // de cambiar.
  const porProducto = new Map<number, number>();
  for (const item of bienesConId) {
    const id = item.productoId!;
    porProducto.set(id, (porProducto.get(id) ?? 0) + Math.ceil(item.cantidadItem));
  }
  const ids = [...porProducto.keys()];

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

      const calculados = conControl.map((f) => {
        const cantidad = porProducto.get(f.id)!;
        return {
          id: f.id,
          cantidad,
          stockAntes: f.stockActual,
          stockDespues: Math.max(0, f.stockActual - cantidad),
        };
      });

      const valores = sql.join(
        calculados.map((c) => sql`(${c.id}::int, ${c.stockDespues}::int)`),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${products} AS p
        SET stock_actual = v.stock, updated_at = now()
        FROM (VALUES ${valores}) AS v(id, stock)
        WHERE p.id = v.id AND p.team_id = ${teamId}
      `);

      await tx.insert(inventoryMovements).values(
        calculados.map((c) => ({
          // NULL cuando la venta no trae almacén: se comporta como antes.
          almacenId: almacenId ?? null,
          teamId,
          productoId: c.id,
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
        // Va en dos pasos a propósito. Restar dentro de un ON CONFLICT obliga a
        // repetir la lista de cantidades en el DO UPDATE, porque ahí EXCLUDED
        // ya trae el valor calculado para la fila nueva y no la cantidad
        // original. Primero se asegura que la fila exista y después se resta.
        const enCero = sql.join(
          calculados.map((c) => sql`(${teamId}::int, ${c.id}::int, ${almacenId}::int, 0::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
          VALUES ${enCero}
          ON CONFLICT (product_id, almacen_id) DO NOTHING
        `);

        const aRestar = sql.join(
          calculados.map((c) => sql`(${c.id}::int, ${c.cantidad}::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE product_almacen_stock AS s
          SET stock_actual = GREATEST(0, s.stock_actual - v.cantidad)
          FROM (VALUES ${aRestar}) AS v(product_id, cantidad)
          WHERE s.product_id = v.product_id AND s.almacen_id = ${almacenId}
        `);
      }
    });
  } catch (e) {
    console.error(`[descontarInventario] ecf=${ecfDocumentId} productos=${ids.join(',')}`, e);
  }
}
