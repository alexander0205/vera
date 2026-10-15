/**
 * Exportar cualquier listado de pantalla (Imprimir / PDF / Excel).
 *
 * Regla de producto (Alex, 15-oct): toda pantalla con un listado lleva filtro
 * por fecha y forma de imprimir y exportar. Casi todas filtran en el navegador
 * con `DataTable`, así que lo más barato y fiel es mandar al servidor las filas
 * TAL COMO SE VEN (filtradas, ordenadas y agrupadas) y que él solo las pinte:
 * el archivo no puede decir otra cosa que la tabla.
 *
 * Aquí vive el contrato del envío y su validación, puro y sin BD, para que la
 * ruta (`/api/export/listado`) solo tenga que pintar.
 */

export type TipoColumnaExport = 'texto' | 'moneda' | 'numero';

export interface ColumnaEnvio {
  titulo: string;
  tipo?: TipoColumnaExport;
  /** Peso relativo del ancho en el PDF (1 por defecto). */
  ancho?: number;
  /** Sumar esta columna en la fila de totales (solo moneda/numero). */
  total?: boolean;
}

/** `moneda` va en centavos, como en toda la app. */
export type CeldaEnvio = string | number | null | { texto: string; sub?: string | null };

export interface FilaEnvio { celdas: CeldaEnvio[]; tachada?: boolean }

export interface ListadoEnvio {
  formato: 'pdf' | 'xlsx';
  /** Abrir el PDF en el visor (botón «Imprimir») en vez de descargarlo. */
  inline?: boolean;
  titulo: string;
  /** Nombre base del archivo, sin extensión. */
  archivo: string;
  filtroTexto: string;
  columnas: ColumnaEnvio[];
  grupos: { titulo?: string | null; filas: FilaEnvio[] }[];
  kpis?: { label: string; valor: string; sub?: string }[];
}

export const MAX_FILAS = 10000;
const MAX_COLUMNAS = 20;

const texto = (v: unknown, max = 300) => String(v ?? '').slice(0, max);

/** Valida y recorta lo que llega del navegador. `null` si no sirve. */
export function validarEnvio(raw: unknown): ListadoEnvio | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.formato !== 'pdf' && r.formato !== 'xlsx') return null;
  if (!Array.isArray(r.columnas) || r.columnas.length === 0 || r.columnas.length > MAX_COLUMNAS) return null;
  if (!Array.isArray(r.grupos)) return null;

  const columnas: ColumnaEnvio[] = r.columnas.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const tipo = o.tipo === 'moneda' || o.tipo === 'numero' ? o.tipo : 'texto';
    const ancho = Number(o.ancho);
    return { titulo: texto(o.titulo, 60), tipo, ancho: ancho > 0 && ancho <= 10 ? ancho : 1, total: o.total === true && tipo !== 'texto' };
  });

  let filasTotales = 0;
  const grupos: ListadoEnvio['grupos'] = [];
  for (const g of r.grupos as unknown[]) {
    const go = (g ?? {}) as Record<string, unknown>;
    if (!Array.isArray(go.filas)) return null;
    filasTotales += go.filas.length;
    if (filasTotales > MAX_FILAS) return null;
    grupos.push({
      titulo: go.titulo ? texto(go.titulo, 150) : null,
      filas: go.filas.map((f) => {
        const fo = (f ?? {}) as Record<string, unknown>;
        const celdas = Array.isArray(fo.celdas) ? fo.celdas : [];
        return {
          tachada: fo.tachada === true,
          celdas: columnas.map((col, i) => normalizarCelda(celdas[i], col.tipo ?? 'texto')),
        };
      }),
    });
  }

  const kpis = Array.isArray(r.kpis)
    ? r.kpis.slice(0, 6).map((k) => {
        const ko = (k ?? {}) as Record<string, unknown>;
        return { label: texto(ko.label, 40), valor: texto(ko.valor, 40), ...(ko.sub ? { sub: texto(ko.sub, 60) } : {}) };
      })
    : undefined;

  return {
    formato: r.formato,
    inline: r.inline === true,
    titulo: texto(r.titulo, 80) || 'Listado',
    // Solo lo que es seguro en un nombre de archivo.
    archivo: texto(r.archivo, 60).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'listado',
    filtroTexto: texto(r.filtroTexto, 500),
    columnas,
    grupos,
    kpis,
  };
}

function normalizarCelda(v: unknown, tipo: TipoColumnaExport): CeldaEnvio {
  if (v == null || v === '') return null;
  if (tipo !== 'texto') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { texto: texto(o.texto), sub: o.sub ? texto(o.sub) : null };
  }
  return texto(v);
}

/** Suma de las columnas marcadas `total`, sin las filas tachadas (anuladas). */
export function totalesEnvio(e: Pick<ListadoEnvio, 'columnas'>, filas: FilaEnvio[]): Record<number, number> {
  const t: Record<number, number> = {};
  e.columnas.forEach((c, i) => {
    if (!c.total) return;
    t[i] = filas.reduce((s, f) => s + (f.tachada ? 0 : Number(f.celdas[i] ?? 0)), 0);
  });
  return t;
}

/** Anchos del PDF en %, a partir de los pesos. */
export function anchosPorcentaje(columnas: ColumnaEnvio[]): string[] {
  const suma = columnas.reduce((s, c) => s + (c.ancho ?? 1), 0);
  return columnas.map((c) => `${((c.ancho ?? 1) / suma * 100).toFixed(2)}%`);
}
