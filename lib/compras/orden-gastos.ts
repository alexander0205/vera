/**
 * El orden de la lista de gastos, y cómo se corta en páginas.
 *
 * Un gasto puede venir de dos tablas —el comprobante de un proveedor y el que
 * emite la propia empresa (e43/e47)— así que la lista se arma juntando dos
 * consultas. Para paginarla sin traerlo todo, de cada una se piden sus primeras
 * N filas y aquí se mezclan.
 *
 * Eso solo funciona si **este orden es el mismo que el de las consultas**
 * (`ORDER BY fecha DESC, id DESC`). Si no coincide, cada página mezcla un
 * conjunto distinto de filas y el resultado es que un gasto sale en dos páginas
 * y otro no sale en ninguna. Pasó: ordenando por la clave de texto, «e10» iba
 * antes que «e9» y la lista repetía gastos.
 *
 * Vive aparte de la pantalla para poder probarlo: el fallo no da error, solo
 * devuelve filas equivocadas.
 */

export interface FilaOrdenable {
  /** 'r' = comprobante del proveedor, 'e' = el que emite la empresa. */
  fuente: 'r' | 'e';
  id: number;
  /** YYYY-MM-DD */
  fecha: string;
}

/**
 * Más nuevo primero; a igualdad de fecha, el id más alto, que es lo que hacen
 * las consultas. Entre fuentes distintas el empate se parte por la letra:
 * arbitrario, pero igual en todas las páginas, que es lo único que importa.
 */
export function compararGastos(a: FilaOrdenable, b: FilaOrdenable): number {
  return b.fecha.localeCompare(a.fecha)
    || (a.fuente === b.fuente ? b.id - a.id : a.fuente.localeCompare(b.fuente));
}

/** Las filas de una página, contando desde 1. */
export function paginaDe<T>(filas: T[], pagina: number, porPagina: number): T[] {
  return filas.slice((pagina - 1) * porPagina, pagina * porPagina);
}
