/**
 * Guarda de precios: quién puede apartarse del precio del catálogo.
 *
 * El permiso `facturas:precio-editar` decide si un rol puede cambiar el precio
 * y el descuento que trae el producto. Bloquear el input en el formulario no
 * alcanza —un POST a mano se lo salta—, así que la regla se vuelve a aplicar
 * aquí, del lado del servidor, antes de guardar la factura.
 *
 * Regla, cuando NO se tiene el permiso:
 *   · toda línea debe apuntar a un producto del catálogo (`productoId`);
 *   · su precio debe ser el del producto, ajustado por la lista de precios
 *     porcentual si la factura usa una;
 *   · no se admite descuento por línea.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, listasPrecios } from '@/lib/db/schema';

export interface LineaPrecio {
  productoId?:         number | null;
  nombreItem?:         string;
  precioUnitarioItem:  number;   // en DOP
  /** La factura manda el descuento ya convertido a monto; la cotización, en %. */
  descuentoPct?:       number;
  descuentoMonto?:     number;
}

/** Tolerancia en pesos: el redondeo de la lista porcentual mueve centavos. */
const TOLERANCIA_DOP = 0.02;

/**
 * Devuelve un mensaje de error si alguna línea se aparta del catálogo, o null
 * si todas están en precio. Quien llama ya verificó que el usuario NO tiene el
 * permiso — esta función no consulta permisos.
 */
export async function validarPreciosDeCatalogo(opts: {
  teamId:          number;
  lineas:          LineaPrecio[];
  listaPreciosId?: number | null;
}): Promise<string | null> {
  const { teamId, lineas, listaPreciosId } = opts;
  if (lineas.length === 0) return null;

  const sinProducto = lineas.find(l => !l.productoId);
  if (sinProducto) {
    return `La línea "${sinProducto.nombreItem?.trim() || 'sin nombre'}" no viene del catálogo. `
      + 'Tu rol solo puede facturar productos ya registrados, con su precio.';
  }

  const conDescuento = lineas.find(l => (l.descuentoPct ?? 0) > 0 || (l.descuentoMonto ?? 0) > 0);
  if (conDescuento) {
    return `Tu rol no puede aplicar descuentos. Quita el descuento de la línea `
      + `"${conDescuento.nombreItem?.trim() || 'sin nombre'}" o pídeselo a un administrador.`;
  }

  const ids = [...new Set(lineas.map(l => l.productoId!))];
  const rows = await db
    .select({ id: products.id, nombre: products.nombre, precio: products.precio })
    .from(products)
    .where(and(eq(products.teamId, teamId), inArray(products.id, ids)));

  const porId = new Map(rows.map(p => [p.id, p]));

  // Lista de precios porcentual: el formulario aplica el mismo ajuste sobre el
  // precio del producto, así que el esperado se mueve con ella.
  let factor = 1;
  if (listaPreciosId) {
    const [lista] = await db
      .select({ tipo: listasPrecios.tipo, porcentaje: listasPrecios.porcentaje, esDescuento: listasPrecios.esDescuento })
      .from(listasPrecios)
      .where(and(eq(listasPrecios.id, listaPreciosId), eq(listasPrecios.teamId, teamId)))
      .limit(1);
    if (lista && lista.tipo === 'porcentaje' && lista.porcentaje > 0) {
      const pct = lista.porcentaje / 10_000;              // basis points → fracción
      factor = lista.esDescuento === 'true' ? 1 - pct : 1 + pct;
    }
  }

  for (const l of lineas) {
    const prod = porId.get(l.productoId!);
    if (!prod) {
      return `Uno de los productos de la factura ya no existe en el catálogo. Vuelve a seleccionarlo.`;
    }
    const esperado = (prod.precio / 100) * factor;
    if (Math.abs(l.precioUnitarioItem - esperado) > TOLERANCIA_DOP) {
      return `El precio de "${prod.nombre}" no coincide con el del catálogo `
        + `(RD$${esperado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}). `
        + 'Tu rol no puede cambiarlo.';
    }
  }

  return null;
}
