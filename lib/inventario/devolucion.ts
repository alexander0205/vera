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
import { and, eq, inArray, sql } from 'drizzle-orm';

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

  // Se acumulan las líneas repetidas del mismo producto antes de tocar la base.
  const porProducto = new Map<number, number>();
  for (const item of bienesConId) {
    const id = item.productoId!;
    porProducto.set(id, (porProducto.get(id) ?? 0) + Math.ceil(item.cantidadItem));
  }
  const ids = [...porProducto.keys()];

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

      const calculados = conControl.map((f) => {
        const cantidad = porProducto.get(f.id)!;
        return {
          id: f.id,
          cantidad,
          stockAntes: f.stockActual,
          stockDespues: f.stockActual + cantidad,
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
          teamId,
          productoId: c.id,
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
        const enCero = sql.join(
          calculados.map((c) => sql`(${teamId}::int, ${c.id}::int, ${almacenId}::int, 0::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
          VALUES ${enCero}
          ON CONFLICT (product_id, almacen_id) DO NOTHING
        `);

        const aSumar = sql.join(
          calculados.map((c) => sql`(${c.id}::int, ${c.cantidad}::int)`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE product_almacen_stock AS s
          SET stock_actual = s.stock_actual + v.cantidad
          FROM (VALUES ${aSumar}) AS v(product_id, cantidad)
          WHERE s.product_id = v.product_id AND s.almacen_id = ${almacenId}
        `);
      }
    });
  } catch (e) {
    console.error(`[restaurarInventario] ecf=${ecfDocumentId} productos=${ids.join(',')}`, e);
  }
}
