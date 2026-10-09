import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { products } from '@/lib/db/schema';

/**
 * ¿Qué productos se ven en el catálogo de Facturación?
 *
 * Un colegio puede tener cafetería: esos productos se venden en el POS y no
 * tienen por qué aparecer al hacer una factura normal. Hay DOS formas de
 * sacarlos, y ambas cuentan:
 *
 *  1. Por producto — `visible_facturacion = false`. Control fino, uno por uno.
 *  2. Por almacén  — `almacenes.solo_pos = true`. Se marca el almacén completo
 *     (p. ej. "Cafetería") y todo lo que viva SOLO ahí desaparece de una vez.
 *
 * La regla del almacén dice "solo ahí" a propósito: si un refresco también
 * tiene existencia en el Almacén Principal, se sigue pudiendo facturar. Ocultar
 * algo que sí se tiene en un almacén normal sería una sorpresa desagradable.
 *
 * Los productos que NO controlan inventario (servicios: mensualidad, matrícula)
 * no tienen existencias en ningún almacén, así que la regla 2 no los toca —
 * solo los saca la marca del producto.
 */
export function visibleEnFacturacion(): SQL {
  return sql`
    ${products.visibleFacturacion} = true
    AND NOT (
      -- Tiene existencias, y TODAS están en almacenes marcados como solo-POS.
      EXISTS (
        SELECT 1 FROM product_almacen_stock pas
        WHERE pas.product_id = ${products.id}
      )
      AND NOT EXISTS (
        SELECT 1 FROM product_almacen_stock pas
        JOIN almacenes a ON a.id = pas.almacen_id
        WHERE pas.product_id = ${products.id}
          AND a.solo_pos = false
      )
    )
  `;
}
