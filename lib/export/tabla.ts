/**
 * De una tabla (`DataTable`) al envío de `/api/export/listado`: las filas tal
 * como se ven, una línea que describe el filtro puesto y los grupos si la
 * tabla está agrupada. Puro, para poder probarlo sin navegador.
 */
import type { CeldaEnvio, ListadoEnvio, TipoColumnaExport } from './listado';

export interface ColumnaExport<T> {
  titulo: string;
  /** Texto, número, o centavos si `tipo` es 'moneda'. */
  valor: (row: T) => string | number | null | undefined;
  /** Segunda línea gris (el RNC bajo el nombre, el NCF bajo el código). */
  sub?: (row: T) => string | null | undefined;
  tipo?: TipoColumnaExport;
  /** Peso del ancho en el PDF (1 por defecto). */
  ancho?: number;
  /** Sumar en la fila de totales. */
  total?: boolean;
}

export interface ExportTabla<T> {
  /** Encabezado del PDF y nombre de la hoja: «Notas de crédito». */
  titulo: string;
  /** Nombre base del archivo: «notas-credito». */
  archivo: string;
  columnas: ColumnaExport<T>[];
  /** Fila anulada: va tachada y no suma. */
  tachada?: (row: T) => boolean;
  /** Tarjetas de arriba del PDF, calculadas sobre las filas exportadas. */
  kpis?: (rows: T[]) => { label: string; valor: string; sub?: string }[];
  /** Filtro que la pantalla aplica fuera de la barra de la tabla (p. ej. su propio rango de fechas). */
  filtroExtra?: string;
}

/** Lo que hace falta saber de los filtros de la tabla para describirlos. */
export type FiltroTabla =
  | { id: string; type: 'search'; label?: string }
  | { id: string; type: 'select'; label?: string; placeholder?: string; options: { value: string; label: string }[] }
  | { id: string; type: 'daterange'; label?: string };

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** «Del 01/10/2026 al 15/10/2026 · Búsqueda: «x» · Estado: Aceptado». */
export function describirFiltrosTabla(filters: FiltroTabla[], valores: Record<string, string>, extra?: string): string {
  const partes: string[] = [];
  if (extra) partes.push(extra);
  for (const f of filters) {
    if (f.type === 'daterange') {
      const d = valores[`${f.id}_desde`], h = valores[`${f.id}_hasta`];
      // Con etiqueta, se dice de qué fecha se trata: «Próxima emisión: del … al …».
      const pre = f.label ? `${f.label}: ` : '';
      if (d && h) partes.push(`${pre}${pre ? 'del' : 'Del'} ${fechaCorta(d)} al ${fechaCorta(h)}`);
      else if (d) partes.push(`${pre}${pre ? 'desde' : 'Desde'} el ${fechaCorta(d)}`);
      else if (h) partes.push(`${pre}${pre ? 'hasta' : 'Hasta'} el ${fechaCorta(h)}`);
      continue;
    }
    const v = valores[f.id];
    if (!v) continue;
    if (f.type === 'search') partes.push(`Búsqueda: «${v}»`);
    else {
      const op = f.options.find((o) => o.value === v)?.label ?? v;
      partes.push(f.label ? `${f.label}: ${op}` : op);
    }
  }
  if (!filters.some((f) => f.type === 'daterange' && (valores[`${f.id}_desde`] || valores[`${f.id}_hasta`])) && !extra) {
    partes.unshift('Todas las fechas');
  }
  return partes.join(' · ');
}

export function armarEnvioTabla<T>(
  cfg: ExportTabla<T>,
  rows: T[],
  filtroTexto: string,
  groupBy?: (row: T) => string,
): Omit<ListadoEnvio, 'formato' | 'inline'> {
  const fila = (r: T) => ({
    tachada: cfg.tachada?.(r) ?? false,
    celdas: cfg.columnas.map((c): CeldaEnvio => {
      const v = c.valor(r);
      const sub = c.sub?.(r);
      if (v == null || v === '') return sub ? { texto: '—', sub } : null;
      return sub && (c.tipo ?? 'texto') === 'texto' ? { texto: String(v), sub } : v;
    }),
  });

  let grupos: ListadoEnvio['grupos'];
  if (groupBy) {
    // En el orden en que aparece cada grupo, como en la tabla.
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = groupBy(r);
      const g = m.get(k);
      if (g) g.push(r); else m.set(k, [r]);
    }
    grupos = [...m].map(([titulo, rs]) => ({ titulo, filas: rs.map(fila) }));
  } else {
    grupos = [{ titulo: null, filas: rows.map(fila) }];
  }

  return {
    titulo: cfg.titulo,
    archivo: cfg.archivo,
    filtroTexto,
    columnas: cfg.columnas.map((c) => ({ titulo: c.titulo, tipo: c.tipo ?? 'texto', ancho: c.ancho, total: c.total })),
    grupos,
    kpis: cfg.kpis?.(rows),
  };
}
