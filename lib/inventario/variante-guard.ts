/**
 * Un producto con variantes solo se vende diciendo CUÁL variante.
 *
 * El formulario y el POS ya obligan a elegirla, pero eso es la UI. Sin este
 * chequeo, un POST directo vende "Camisa" sin decir si es M o L: el descuento
 * cae al stock del producto, el de las variantes queda intacto, y los números
 * dejan de cuadrar sin que nadie lo note. Mismo razonamiento que el guard de
 * precios (lib/facturas/precio-guard.ts): la regla vive donde entra el dato, no
 * donde se dibuja.
 *
 * Devuelve un mensaje si algo no cuadra, o null si todo está bien.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, productVariants } from '@/lib/db/schema';

export interface LineaConVariante {
  productoId?:             number | null;
  variantId?:              number | null;
  indicadorBienoServicio?: 1 | 2;
  nombreItem?:             string | null;
}

export async function validarVariantes(
  teamId: number,
  lineas: LineaConVariante[],
): Promise<string | null> {
  // Solo bienes del catálogo: los servicios y las líneas libres no tienen stock.
  const bienes = lineas.filter(
    l => l.indicadorBienoServicio === 1 && l.productoId && l.productoId > 0,
  );
  if (bienes.length === 0) return null;

  const ids = [...new Set(bienes.map(l => l.productoId!))];
  const filas = await db
    .select({
      id:      products.id,
      nombre:  products.nombre,
      ejes:    products.variantAtributos,
    })
    .from(products)
    .where(and(eq(products.teamId, teamId), inArray(products.id, ids)));

  const porId = new Map(filas.map(f => [f.id, f]));

  for (const linea of bienes) {
    const prod = porId.get(linea.productoId!);
    // Producto inexistente o de otra empresa: no es asunto de este guard, lo
    // resuelve el descuento de inventario (que filtra por team).
    if (!prod) continue;

    const ejes = (prod.ejes as { nombre: string; valores: string[] }[] | null) ?? [];
    if (ejes.length === 0) continue;   // producto sin variantes: nada que exigir

    if (!linea.variantId) {
      const cuales = ejes.map(e => e.nombre).join(' y ');
      return `«${prod.nombre}» se vende por ${cuales}. Elige cuál antes de facturar.`;
    }
  }

  // Las variantes declaradas tienen que existir, estar activas y pertenecer a
  // su producto. Una sola consulta para todas.
  const declaradas = bienes
    .filter(l => l.variantId)
    .map(l => ({ variantId: l.variantId!, productoId: l.productoId! }));
  if (declaradas.length === 0) return null;

  const validas = await db
    .select({ id: productVariants.id, productId: productVariants.productId })
    .from(productVariants)
    .where(and(
      eq(productVariants.teamId, teamId),
      eq(productVariants.activo, true),
      inArray(productVariants.id, declaradas.map(d => d.variantId)),
    ));

  const validaDe = new Map(validas.map(v => [v.id, v.productId]));
  for (const d of declaradas) {
    if (validaDe.get(d.variantId) !== d.productoId) {
      const prod = porId.get(d.productoId);
      return `La variante elegida para «${prod?.nombre ?? 'el producto'}» ya no está disponible. `
           + 'Vuelve a elegirla.';
    }
  }

  return null;
}
