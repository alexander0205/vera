/**
 * Qué significa «agotado» en la caja, en un solo sitio.
 *
 * La cuenta vivía copiada en la grilla de venta y en la de editar recibo, y el
 * catálogo del servidor la necesita además para ordenar. Tres copias de una
 * regla que decide si un producto se puede cobrar es una de más.
 *
 * Vive aparte de catalogo.ts a propósito: ese módulo arrastra la conexión a la
 * base y esto lo importan componentes de cliente.
 */

export interface EstadoStock {
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  /** Stock en el almacén de la terminal; null cuando no controla inventario. */
  stockAlmacen:         number | null;
}

/** No se puede cobrar: lleva inventario, no admite vender en rojo, y no queda. */
export function estaAgotado(p: EstadoStock): boolean {
  return p.controlaInventario && !p.permiteVentaSinStock && (p.stockAlmacen ?? 0) <= 0;
}

/**
 * En qué orden se pintan los productos en la caja.
 *
 * Lo agotado, al final. Ocupa el mismo hueco que algo que sí se puede cobrar, y
 * en una caja lo de arriba es lo único que se mira: quien atiende no debería
 * tener que saltarse siete abrigos sin existencias para llegar a la empanada.
 * Se sigue enseñando —en gris, sin poder tocarse— porque desaparecer del todo
 * tampoco sirve: hay que poder ver que el producto existe y que toca reponer.
 *
 * Un favorito agotado también baja. Marcarlo favorito dice «esto se vende
 * mucho», no «esto se puede cobrar ahora»; si no queda, arriba solo estorba.
 *
 * Dentro de cada grupo manda el criterio de siempre: favoritos primero, luego
 * alfabético en español (que la ñ y los acentos caigan donde la gente espera).
 */
export function compararParaCaja(
  a: EstadoStock & { favorito: boolean; nombre: string },
  b: EstadoStock & { favorito: boolean; nombre: string },
): number {
  return Number(estaAgotado(a)) - Number(estaAgotado(b))
    || Number(b.favorito) - Number(a.favorito)
    || a.nombre.localeCompare(b.nombre, 'es');
}
