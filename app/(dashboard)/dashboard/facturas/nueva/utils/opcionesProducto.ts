// Identidad de las opciones del buscador de productos de «Nueva factura».

import type { Producto } from './types';

/**
 * Clave única y estable de una opción del buscador.
 *
 * El buscador mezcla productos del catálogo con cuotas del plan del alumno. A
 * las cuotas se les inventa un `id` negativo que NO es único (dos conceptos del
 * mismo mes, o un adelanto sin cargo, caen en el mismo número), así que el `id`
 * no sirve de clave de React: con él salía el aviso «two children with the
 * same key» decenas de veces. Cada tipo lleva su prefijo para que una cuota
 * nunca se confunda con un producto, aunque compartan número.
 */
export function claveOpcionProducto(p: Producto): string {
  const c = p.cuotaEscolar;
  if (c) return `cuota:${c.clave ?? `${c.estudianteId}:${c.cargoId}:${c.mes ?? 0}:${c.anio}`}`;
  return `prod:${p.id}`;
}

/** Quita las opciones repetidas de verdad (misma clave), conservando la primera. */
export function sinOpcionesRepetidas(opciones: Producto[]): Producto[] {
  const vistas = new Set<string>();
  return opciones.filter((o) => {
    const k = claveOpcionProducto(o);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}
