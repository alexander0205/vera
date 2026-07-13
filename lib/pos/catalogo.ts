/**
 * POS — Catálogo de venta. Productos que aparecen en la grilla de una terminal.
 *
 * Separación por punto de venta: un producto con control de inventario solo
 * aparece donde tiene stock asignado (fila en product_almacen_stock del almacén
 * de la terminal). Los productos sin control de inventario aparecen siempre.
 * Excluye lo no vendible en mostrador vía products.visible_pos.
 */

import { and, eq, asc, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, productAlmacenStock, listasPrecios_items, categorias } from '@/lib/db/schema';

export interface ProductoPos {
  id:                   number;
  nombre:               string;
  referencia:           string | null;
  codigoBarras:         string | null;
  precio:               number;   // centavos efectivos para la terminal
  tasaItbis:            string;
  tipo:                 string;   // 'bien' | 'servicio'
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  favorito:             boolean;
  /** Stock en el almacén de la terminal. null si el producto no controla inventario. */
  stockAlmacen:         number | null;
  categoriaId:          number | null;
  categoriaNombre:      string | null;
  imagen:               string | null;
}

export async function getCatalogoPos(
  teamId: number,
  almacenId: number,
  listaPreciosId?: number | null,
): Promise<ProductoPos[]> {
  const rows = await db
    .select({
      id:                   products.id,
      nombre:               products.nombre,
      referencia:           products.referencia,
      codigoBarras:         products.codigoBarras,
      precio:               products.precio,
      precioLista:          listasPrecios_items.precio,
      tasaItbis:            products.tasaItbis,
      tipo:                 products.tipo,
      controlaInventario:   products.controlaInventario,
      permiteVentaSinStock: products.permiteVentaSinStock,
      favorito:             products.posFavorito,
      stockAlmacen:         productAlmacenStock.stockActual,
      categoriaId:          products.categoriaId,
      categoriaNombre:      categorias.nombre,
      imagen:               products.imagen,
    })
    .from(products)
    .leftJoin(
      productAlmacenStock,
      and(
        eq(productAlmacenStock.productId, products.id),
        eq(productAlmacenStock.almacenId, almacenId),
      ),
    )
    .leftJoin(
      listasPrecios_items,
      and(
        eq(listasPrecios_items.productoId, products.id),
        listaPreciosId
          ? eq(listasPrecios_items.listaPreciosId, listaPreciosId)
          : sql`false`,
      ),
    )
    .leftJoin(categorias, eq(categorias.id, products.categoriaId))
    .where(and(
      eq(products.teamId, teamId),
      eq(products.activo, 'true'),
      eq(products.visiblePos, true),
      sql`(${products.controlaInventario} = false OR ${productAlmacenStock.id} IS NOT NULL)`,
    ))
    .orderBy(desc(products.posFavorito), asc(products.nombre));

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    referencia: r.referencia,
    codigoBarras: r.codigoBarras,
    precio: r.precioLista ?? r.precio,
    tasaItbis: r.tasaItbis,
    tipo: r.tipo,
    controlaInventario: r.controlaInventario,
    permiteVentaSinStock: r.permiteVentaSinStock,
    favorito: r.favorito,
    stockAlmacen: r.controlaInventario ? Number(r.stockAlmacen ?? 0) : null,
    categoriaId: r.categoriaId,
    categoriaNombre: r.categoriaNombre,
    imagen: r.imagen,
  }));
}
