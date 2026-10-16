/**
 * Trae todas las páginas de un listado paginado para exportarlo desde el
 * navegador (pagos escolares, matrículas).
 *
 * Revisión del PR #126: el exporte iba página a página en serie (hasta 50, cada
 * una con su `count(*)`), no miraba `r.ok` —un 403 o un 500 salía como un
 * archivo vacío— y al llegar al tope cortaba sin decirlo. Aquí:
 *  - un error del servidor corta el exporte con su mensaje;
 *  - la primera página trae el total; las demás van de `paralelo` en
 *    `paralelo` y con `sinTotal=1`, para no repetir el conteo;
 *  - si el listado pasa del tope, `truncado` lo dice para ponerlo en el archivo.
 */
export interface Paginas<T> {
  filas: T[];
  total: number;
  truncado: boolean;
}

async function leer(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url);
  const data = await r.json().catch(() => null) as Record<string, unknown> | null;
  if (!r.ok || !data) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo leer el listado para exportarlo');
  }
  return data;
}

export async function traerPaginas<T>(
  url: (pagina: number) => string,
  clave: string,
  { maxPaginas = 50, paralelo = 4 }: { maxPaginas?: number; paralelo?: number } = {},
): Promise<Paginas<T>> {
  const primera = await leer(url(1));
  const filas = [...((primera[clave] ?? []) as T[])];
  const total = Number(primera.total ?? filas.length);
  const paginas = Math.max(1, Number(primera.paginas ?? 1));
  const hasta = Math.min(paginas, maxPaginas);

  const resto = Array.from({ length: hasta - 1 }, (_, i) => i + 2);
  for (let i = 0; i < resto.length; i += paralelo) {
    const tanda = await Promise.all(resto.slice(i, i + paralelo).map((p) => {
      const u = url(p);
      return leer(`${u}${u.includes('?') ? '&' : '?'}sinTotal=1`);
    }));
    for (const d of tanda) filas.push(...((d[clave] ?? []) as T[]));
  }
  return { filas, total, truncado: paginas > maxPaginas };
}

/** La nota que va en el filtro del archivo cuando no salió todo. */
export function notaDeCorte(exportadas: number, total: number): string {
  return `Solo las primeras ${exportadas.toLocaleString('es-DO')} de ${total.toLocaleString('es-DO')}: acota las fechas o el filtro para el resto`;
}
