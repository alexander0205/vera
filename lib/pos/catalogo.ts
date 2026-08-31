/**
 * POS — Catálogo de venta. Productos que aparecen en la grilla de una terminal.
 *
 * Separación por punto de venta: un producto con control de inventario solo
 * aparece donde tiene stock asignado (fila en product_almacen_stock del almacén
 * de la terminal). Los productos sin control de inventario aparecen siempre.
 * Excluye lo no vendible en mostrador vía products.visible_pos.
 *
 * Y excluye SIEMPRE el servicio de mora, mire lo que mire `visible_pos`. No es
 * una preferencia del comerciante: su precio de catálogo es 0 porque el monto
 * lo calcula `lib/cobranza/nota-debito-mora.ts` por factura vencida, así que
 * tocarlo en la caja no cobra la mora — emite un comprobante fiscal de cero
 * pesos. Lo que no se puede hacer bien no se ofrece; dejarlo como interruptor
 * apagable solo garantiza que algún día alguien lo encienda «para probar».
 */

import { and, eq, asc, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, productAlmacenStock, listasPrecios_items, categorias } from '@/lib/db/schema';
import { compararParaCaja } from '@/lib/pos/agotado';

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
  /** Stock en el almacén de la terminal. null si el producto no controla inventario.
   *  Para productos con variantes es la suma del stock de sus variantes EN ESE
   *  almacén (Opción B: product_variant_almacen_stock). */
  stockAlmacen:         number | null;
  categoriaId:          number | null;
  categoriaNombre:      string | null;
  imagen:               string | null;
  /** Ejes de variante del producto. Vacío = sin variantes. */
  variantAtributos:     { nombre: string; valores: string[] }[];
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
      // Suma del stock de las variantes de este producto en ESTE almacén.
      variantStockAlmacen:  sql<number>`COALESCE((
        SELECT SUM(pvas.stock_actual)
          FROM product_variant_almacen_stock pvas
          JOIN product_variants pv ON pv.id = pvas.variant_id
         WHERE pv.product_id = ${products.id}
           AND pvas.almacen_id = ${almacenId}
      ), 0)`,
      variantAtributos:     products.variantAtributos,
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
      eq(products.esMora, false),
      // Aparece si: no controla inventario, tiene stock de producto en este
      // almacén, o tiene alguna variante con stock asignado en este almacén.
      sql`(${products.controlaInventario} = false
           OR ${productAlmacenStock.id} IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM product_variant_almacen_stock pvas
               JOIN product_variants pv ON pv.id = pvas.variant_id
              WHERE pv.product_id = ${products.id} AND pvas.almacen_id = ${almacenId}
           ))`,
    ))
    // El orden definitivo se termina abajo: «agotado» depende del stock de las
    // variantes en ESTE almacén, que es una subconsulta — ordenar por ella en
    // SQL obligaría a repetirla en el ORDER BY. Aquí se deja el criterio base.
    .orderBy(desc(products.posFavorito), asc(products.nombre));

  const catalogo = rows.map((r) => {
    const variantAtributos = (r.variantAtributos as { nombre: string; valores: string[] }[] | null) ?? [];
    const tieneVariantes = variantAtributos.length > 0;
    return {
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
      // Con variantes: suma del stock de variantes en este almacén.
      // Sin variantes: el stock del producto en este almacén.
      stockAlmacen: tieneVariantes
        ? Number(r.variantStockAlmacen ?? 0)
        : (r.controlaInventario ? Number(r.stockAlmacen ?? 0) : null),
      categoriaId: r.categoriaId,
      categoriaNombre: r.categoriaNombre,
      imagen: r.imagen,
      variantAtributos,
    };
  });

  return catalogo.sort(compararParaCaja);
}
