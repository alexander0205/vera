/**
 * El filtro de la pantalla «Pagos recibidos», como función pura.
 *
 * La pantalla filtra en el navegador lo que ya cargó, y el Excel/PDF lo hacen
 * en el servidor. Si cada uno filtrara a su manera, el archivo diría otra cosa
 * que la tabla que el usuario tiene delante; por eso los dos llaman a
 * `filtrarPagos` de aquí. También se leen y escriben los parámetros de la URL
 * del export en un solo sitio.
 */

import { labelMetodo } from './metodos';

export type OrigenPago = 'pos' | 'facturacion';
export type AgruparPagos = 'factura' | 'metodo' | 'cliente' | 'fecha';

export interface FiltroPagos {
  /** YYYY-MM-DD, inclusive. */
  desde?: string;
  hasta?: string;
  /** Cliente, RNC, referencia, código o NCF. */
  q?: string;
  metodo?: string;
  origen?: OrigenPago;
  tipoVenta?: 'producto' | 'servicio';
  dgii?: 'enviado' | 'no';
  agrupar?: AgruparPagos;
}

/** Lo mínimo de un pago que el filtro necesita. */
export interface PagoFiltrable {
  cliente: string | null;
  rncComprador: string | null;
  referencia: string | null;
  docCodigo: string | null;
  docEncf: string | null;
  docId: number | null;
  metodo: string | null;
  origen: OrigenPago;
  enviadoDgii: boolean;
  fechaPago: string;
  productos?: { servicio: boolean }[];
}

export const ORIGEN_LABEL: Record<OrigenPago, string> = { pos: 'Punto de venta', facturacion: 'Facturación' };

const AGRUPAR: AgruparPagos[] = ['factura', 'metodo', 'cliente', 'fecha'];
const AGRUPAR_LABEL: Record<AgruparPagos, string> = {
  factura: 'por factura', metodo: 'por método', cliente: 'por cliente', fecha: 'por fecha',
};

export function filtrarPagos<T extends PagoFiltrable>(pagos: T[], f: FiltroPagos): T[] {
  let rows = pagos;
  const q = (f.q ?? '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(p =>
      (p.cliente ?? 'consumidor final').toLowerCase().includes(q) ||
      (p.rncComprador ?? '').toLowerCase().includes(q) ||
      (p.referencia ?? '').toLowerCase().includes(q) ||
      (p.docCodigo ?? '').toLowerCase().includes(q) ||
      (p.docEncf ?? '').toLowerCase().includes(q),
    );
  }
  if (f.metodo) rows = rows.filter(p => (p.metodo ?? 'otro').toLowerCase() === f.metodo);
  if (f.origen) rows = rows.filter(p => p.origen === f.origen);
  if (f.tipoVenta) {
    // Diferencia venta de Producto vs Servicio (no un artículo individual):
    // basta con que el cobro incluya al menos una línea de esa categoría.
    const esServicio = f.tipoVenta === 'servicio';
    rows = rows.filter(p => (p.productos ?? []).some(pr => pr.servicio === esServicio));
  }
  if (f.dgii === 'enviado') rows = rows.filter(p => p.enviadoDgii);
  else if (f.dgii === 'no') rows = rows.filter(p => !p.enviadoDgii);
  return rows;
}

/** La clave del grupo de un pago, igual que la pantalla al agrupar. */
export function grupoDePago(p: PagoFiltrable, agrupar: AgruparPagos, fmtFecha: (iso: string) => string): string {
  switch (agrupar) {
    case 'factura': return p.docCodigo ?? p.docEncf ?? (p.docId ? `#${p.docId}` : 'Sin documento');
    case 'metodo':  return labelMetodo(p.metodo);
    case 'cliente': return p.cliente ?? 'Consumidor Final';
    case 'fecha':   return fmtFecha(p.fechaPago);
  }
}

/**
 * Agrupa conservando el orden: cada grupo aparece donde salió su primer pago,
 * como en la tabla.
 */
export function agruparPagos<T extends PagoFiltrable>(
  pagos: T[], agrupar: AgruparPagos | undefined, fmtFecha: (iso: string) => string,
): { clave: string | null; pagos: T[] }[] {
  if (!agrupar) return [{ clave: null, pagos }];
  const grupos = new Map<string, T[]>();
  for (const p of pagos) {
    const k = grupoDePago(p, agrupar, fmtFecha);
    const g = grupos.get(k);
    if (g) g.push(p); else grupos.set(k, [p]);
  }
  return [...grupos].map(([clave, ps]) => ({ clave, pagos: ps }));
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | undefined> | URLSearchParams;
function leer(sp: Params, k: string): string | undefined {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return v?.trim() || undefined;
}

/** Lee el filtro de los parámetros (URL del export o `filterValues` de la pantalla). */
export function leerFiltroPagos(sp: Params): FiltroPagos {
  const f: FiltroPagos = {};
  const desde = leer(sp, 'desde');
  const hasta = leer(sp, 'hasta');
  if (desde && FECHA.test(desde)) f.desde = desde;
  if (hasta && FECHA.test(hasta)) f.hasta = hasta;
  const q = leer(sp, 'q');
  if (q) f.q = q.slice(0, 100);
  const metodo = leer(sp, 'metodo');
  if (metodo) f.metodo = metodo.toLowerCase().slice(0, 40);
  const origen = leer(sp, 'origen');
  if (origen === 'pos' || origen === 'facturacion') f.origen = origen;
  const tipoVenta = leer(sp, 'tipoVenta');
  if (tipoVenta === 'producto' || tipoVenta === 'servicio') f.tipoVenta = tipoVenta;
  const dgii = leer(sp, 'dgii');
  if (dgii === 'enviado' || dgii === 'no') f.dgii = dgii;
  const agrupar = leer(sp, 'agrupar');
  if (AGRUPAR.includes(agrupar as AgruparPagos)) f.agrupar = agrupar as AgruparPagos;
  return f;
}

export function filtroPagosAParams(f: FiltroPagos): URLSearchParams {
  const q = new URLSearchParams();
  for (const k of ['desde', 'hasta', 'q', 'metodo', 'origen', 'tipoVenta', 'dgii', 'agrupar'] as const) {
    const v = f[k];
    if (v) q.set(k, v);
  }
  return q;
}

/** Una línea legible del filtro, para el encabezado del Excel y del PDF. */
export function describirFiltroPagos(f: FiltroPagos, fmtFecha: (iso: string) => string): string {
  const partes: string[] = [];
  if (f.desde && f.hasta) partes.push(`Del ${fmtFecha(f.desde)} al ${fmtFecha(f.hasta)}`);
  else if (f.desde) partes.push(`Desde el ${fmtFecha(f.desde)}`);
  else if (f.hasta) partes.push(`Hasta el ${fmtFecha(f.hasta)}`);
  else partes.push('Todas las fechas');
  if (f.q) partes.push(`Búsqueda: «${f.q}»`);
  if (f.metodo) partes.push(`Método: ${labelMetodo(f.metodo)}`);
  if (f.origen) partes.push(`Origen: ${ORIGEN_LABEL[f.origen]}`);
  if (f.tipoVenta) partes.push(f.tipoVenta === 'servicio' ? 'Con servicios' : 'Con productos');
  if (f.dgii) partes.push(f.dgii === 'enviado' ? 'Enviados a DGII' : 'No enviados a DGII');
  if (f.agrupar) partes.push(`Agrupado ${AGRUPAR_LABEL[f.agrupar]}`);
  return partes.join(' · ');
}
