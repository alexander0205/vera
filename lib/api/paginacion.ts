/**
 * Paginación para los listados.
 *
 * Existe porque varios endpoints devuelven la tabla entera: con un colegio de
 * 465 estudiantes se nota poco, pero el mismo endpoint con veinte colegios
 * manda miles de filas que el navegador tiene que recibir, parsear y pintar
 * para enseñar treinta.
 *
 * La forma de la respuesta es siempre la misma —`{ datos, total, pagina,
 * porPagina, paginas }`— para que el cliente no tenga que aprenderse un
 * contrato distinto por pantalla.
 */

/** Tope duro: nadie necesita mil filas de golpe, y pedirlas suele ser un error. */
const MAX_POR_PAGINA = 200;
const POR_PAGINA_DEFECTO = 50;

export interface Paginacion {
  pagina: number;
  porPagina: number;
  /** Para pasarle directo a Drizzle. */
  limit: number;
  offset: number;
}

/**
 * Lee `?pagina=` y `?porPagina=` de la URL, con valores sanos por defecto.
 * Nunca lanza: una página inválida se trata como la primera, que es lo que el
 * usuario espera al escribir cualquier cosa en la barra de direcciones.
 */
export function leerPaginacion(url: string | URL): Paginacion {
  const params = (url instanceof URL ? url : new URL(url)).searchParams;

  const pagina = Math.max(1, Math.floor(Number(params.get('pagina')) || 1));

  // Un tamaño inválido cae al valor por defecto, no al mínimo: recortarlo a 1
  // convertía `porPagina=-3` en una fila por página, que es peor que ignorarlo.
  const crudo = Math.floor(Number(params.get('porPagina')));
  const pedido = Number.isFinite(crudo) && crudo > 0 ? crudo : POR_PAGINA_DEFECTO;
  const porPagina = Math.min(MAX_POR_PAGINA, pedido);

  return { pagina, porPagina, limit: porPagina, offset: (pagina - 1) * porPagina };
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

/** Envuelve las filas con lo que el cliente necesita para pintar el paginador. */
export function armarPagina<T>(datos: T[], total: number, p: Paginacion): Pagina<T> {
  return {
    datos,
    total,
    pagina: p.pagina,
    porPagina: p.porPagina,
    paginas: Math.max(1, Math.ceil(total / p.porPagina)),
  };
}
