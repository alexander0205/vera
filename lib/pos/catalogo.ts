/**
 * POS — Catálogo de venta. Productos que aparecen en la grilla de una terminal.
 *
 * Separación por punto de venta: un producto con control de inventario solo
 * aparece donde tiene stock asignado (fila en product_almacen_stock del almacén
 * de la terminal). Los productos sin control de inventario aparecen siempre.
 * Excluye lo no vendible en mostrador vía products.visible_pos.
 */

import { and, eq, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, productAlmacenStock } from '@/lib/db/schema';

export interface ProductoPos {
  id:                   number;
  nombre:               string;
  referencia:           string | null;
  codigoBarras:         string | null;
  precio:               number;   // centavos (precio base; lista de precios se aplica en checkout)
  tasaItbis:            string;
  tipo:                 string;   // 'bien' | 'servicio'
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  /** Stock en el almacén de la terminal. null si el producto no controla inventario. */
  stockAlmacen:         number | null;
}

export async function getCatalogoPos(teamId: number, almacenId: number): Promise<ProductoPos[]> {
  const rows = await db
    .select({
      id:                   products.id,
      nombre:               products.nombre,
      referencia:           products.referencia,
      codigoBarras:         products.codigoBarras,
      precio:               products.precio,
      tasaItbis:            products.tasaItbis,
      tipo:                 products.tipo,
      controlaInventario:   products.controlaInventario,
      permiteVentaSinStock: products.permiteVentaSinStock,
      stockAlmacen:         productAlmacenStock.stockActual,
    })
    .from(products)
    .leftJoin(
      productAlmacenStock,
      and(
        eq(productAlmacenStock.productId, products.id),
        eq(productAlmacenStock.almacenId, almacenId),
      ),
    )
    .where(and(
      eq(products.teamId, teamId),
      eq(products.activo, 'true'),
      eq(products.visiblePos, true),
      // Separación ESTRICTA por punto de venta: el producto aparece solo si está
      // asignado al almacén de la terminal (tiene fila en product_almacen_stock).
      // Aplica por igual a bienes con o sin control de inventario.
      sql`${productAlmacenStock.id} IS NOT NULL`,
    ))
    .orderBy(asc(products.nombre));

  return rows.map((r) => ({
    ...r,
    stockAlmacen: r.controlaInventario ? Number(r.stockAlmacen ?? 0) : null,
  }));
}
