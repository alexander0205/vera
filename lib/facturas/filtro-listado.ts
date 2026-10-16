/**
 * El filtro de «Facturas de venta» y el estado de pago que enseña cada fila,
 * como funciones puras.
 *
 * Lo usan la tabla (que pide `/api/facturas`), el CSV y el Excel/PDF
 * (`/api/facturas/export`). Antes el CSV armaba su propio filtro y se dejaba la
 * búsqueda, «Con NCs» y los maestros: el archivo traía otras facturas que las
 * de la tabla. Aquí se lee y se escribe una sola vez. Sin BD.
 */

import { calcularEstadoPago, retencionesQueSaldan } from './estado-pago-calc';
import { diasVencido } from '@/lib/utils/format';

export interface FiltroFacturas {
  /** e-NCF, código o cliente. */
  q?: string;
  estado?: string;
  /** YYYY-MM-DD, por fecha de creación (igual que la tabla). */
  desde?: string;
  hasta?: string;
  conNcs?: boolean;
  /** Valores de maestro de factura (Plan A); varios = deben estar todos. */
  maestroValorIds?: number[];
}

export const ESTADOS_DGII: { value: string; label: string }[] = [
  { value: 'BORRADOR',             label: 'Sin comprobante' },
  { value: 'EN_PROCESO',           label: 'En proceso' },
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Aceptado condicional' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
  { value: 'HISTORICA',            label: 'Histórica (importada)' },
];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee el filtro de la URL. Acepta `search` (lo que manda la tabla a
 * `/api/facturas`) y `q`; `estado=todos` es lo mismo que no filtrar.
 */
export function leerFiltroFacturas(sp: URLSearchParams): FiltroFacturas {
  const f: FiltroFacturas = {};
  const q = (sp.get('search') ?? sp.get('q') ?? '').trim();
  if (q) f.q = q.slice(0, 100);
  const estado = sp.get('estado')?.trim();
  if (estado && estado !== 'todos') f.estado = estado.slice(0, 30);
  const desde = sp.get('desde')?.trim();
  const hasta = sp.get('hasta')?.trim();
  if (desde && FECHA.test(desde)) f.desde = desde;
  if (hasta && FECHA.test(hasta)) f.hasta = hasta;
  if (sp.get('conNcs') === '1' || sp.get('conNcs') === 'true') f.conNcs = true;
  const ids = sp.getAll('maestroValorId').map((v) => parseInt(v, 10)).filter(Number.isFinite);
  if (ids.length) f.maestroValorIds = ids;
  return f;
}

/** Al formato que entienden `/api/facturas` y `/api/facturas/export`. */
export function filtroFacturasAParams(f: FiltroFacturas): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set('search', f.q);
  if (f.estado) sp.set('estado', f.estado);
  if (f.desde) sp.set('desde', f.desde);
  if (f.hasta) sp.set('hasta', f.hasta);
  if (f.conNcs) sp.set('conNcs', '1');
  for (const id of f.maestroValorIds ?? []) sp.append('maestroValorId', String(id));
  return sp;
}

/**
 * Los `filterValues` de la tabla (DataTable) al filtro: `q`, `estado`,
 * `fecha_desde`/`fecha_hasta`, `conNcs` y un `m_<maestroId>` por maestro.
 */
export function filtroDesdeValores(v: Record<string, string>): FiltroFacturas {
  const sp = new URLSearchParams();
  if (v.q) sp.set('search', v.q);
  if (v.estado) sp.set('estado', v.estado);
  if (v.fecha_desde) sp.set('desde', v.fecha_desde);
  if (v.fecha_hasta) sp.set('hasta', v.fecha_hasta);
  if (v.conNcs === '1') sp.set('conNcs', '1');
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith('m_') && val) sp.append('maestroValorId', val);
  }
  return leerFiltroFacturas(sp);
}

/** Una línea legible del filtro. `maestros` traduce cada valor a «Maestro: valor». */
export function describirFiltroFacturas(
  f: FiltroFacturas, fmtFecha: (iso: string) => string, maestros: Map<number, string> = new Map(),
): string {
  const partes: string[] = [];
  if (f.desde && f.hasta) partes.push(`Del ${fmtFecha(f.desde)} al ${fmtFecha(f.hasta)}`);
  else if (f.desde) partes.push(`Desde el ${fmtFecha(f.desde)}`);
  else if (f.hasta) partes.push(`Hasta el ${fmtFecha(f.hasta)}`);
  else partes.push('Todas las fechas');
  if (f.q) partes.push(`Búsqueda: «${f.q}»`);
  if (f.estado) partes.push(`Estado: ${ESTADOS_DGII.find((e) => e.value === f.estado)?.label ?? f.estado}`);
  if (f.conNcs) partes.push('Con notas de crédito/débito');
  for (const id of f.maestroValorIds ?? []) partes.push(maestros.get(id) ?? `Maestro #${id}`);
  return partes.join(' · ');
}

export type EtiquetaPago = 'Pagada' | 'Parcial' | 'Pendiente' | 'Vencida' | 'Gratuita' | 'Uso' | 'Anulada';

/** Lo mínimo de una factura para saber qué estado de pago enseña. */
export interface FacturaParaEstado {
  estado: string;
  tipoEcf: string;
  tipoPago: number | null;
  montoTotal: number;
  totalRetenciones?: number | null;
  pagado: number;
  fechaLimitePago: string | null;
  moraPendiente?: number;
  ndPendiente?: number;
}

/**
 * El estado de pago de la columna «Pago», con su saldo y un detalle para el
 * tooltip. La tabla y los archivos lo sacan de aquí para no discrepar.
 */
export function estadoPagoFactura(doc: FacturaParaEstado, hoy?: string): { etiqueta: EtiquetaPago; saldo: number; detalle?: string } {
  const retenido = retencionesQueSaldan(doc.tipoEcf, doc.totalRetenciones);
  const ep = calcularEstadoPago({
    estado: doc.estado, tipoPago: doc.tipoPago, montoTotal: doc.montoTotal, totalPagado: doc.pagado,
    totalRetenciones: retenido,
  });
  const saldoCapital = Math.max(0, doc.montoTotal - retenido - doc.pagado);
  // Cualquier nota de débito viva sobre esta factura —mora automática o cargo
  // manual— es deuda de la misma cuenta.
  const ndPend = Number(doc.moraPendiente ?? 0) + Number(doc.ndPendiente ?? 0);
  switch (ep) {
    case 'ANULADA':  return { etiqueta: 'Anulada', saldo: 0 };
    case 'GRATUITA': return { etiqueta: 'Gratuita', saldo: 0 };
    case 'USO':      return { etiqueta: 'Uso', saldo: 0 };
    case 'PAGADA':
      // Capital saldado pero con notas de débito sin pagar: no está cobrada del todo.
      return ndPend > 0
        ? { etiqueta: 'Parcial', saldo: ndPend, detalle: 'notas de débito' }
        : { etiqueta: 'Pagada', saldo: 0 };
    case 'PARCIAL':  return { etiqueta: 'Parcial', saldo: saldoCapital + ndPend };
    case 'PENDIENTE': {
      const dias = doc.tipoPago === 2 ? diasVencido(doc.fechaLimitePago, hoy) : 0;
      return dias > 0
        ? { etiqueta: 'Vencida', saldo: saldoCapital + ndPend, detalle: `hace ${dias}d` }
        : { etiqueta: 'Pendiente', saldo: saldoCapital + ndPend };
    }
  }
}
