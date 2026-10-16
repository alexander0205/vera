/**
 * Las filas de la lista de Gastos, ya juntadas las dos fuentes.
 *
 * La pantalla, el Excel y la vista para imprimir/PDF enseñan la misma lista;
 * se arma aquí una vez para que no digan cosas distintas.
 */

import { listarCompras, listarGastosEcf } from './consultas';
import { analizarNcf } from './fiscal';
import { compararGastos } from './orden-gastos';
import type { FiltroGastos } from './filtro-gastos';

export interface FilaGasto {
  key: string;
  /** De qué tabla sale y con qué id: con eso se ordena igual que la consulta. */
  fuente: 'r' | 'e';
  id: number;
  fecha: string;
  proveedor: string;
  rnc: string | null;
  comprobante: string | null;
  tipo: string;
  categoria: string;
  href: string;
  anulado: boolean;
  borrador: boolean;
  pagado: boolean;
  saldoCents: number;
  metodo: string | null;
  cuenta: string | null;
  retencionesCents: number;
  montoCents: number;
}

export const METODO_LABEL: Record<string, string> = {
  efectivo: 'efectivo', transferencia: 'transferencia', tarjeta: 'tarjeta',
  cheque: 'cheque', deposito: 'depósito', otro: 'otro método',
};

/** Texto del estado de pago, para el Excel y el PDF. */
export function estadoPagoTexto(f: FilaGasto): string {
  if (f.anulado) return 'Anulado';
  if (!f.pagado) return 'Por pagar';
  return 'Pagado';
}

/**
 * Los gastos del filtro, del más nuevo al más viejo. `hasta` es cuántas filas
 * pedir a cada fuente: la pantalla pide justo hasta el final de su página; el
 * Excel y el PDF, todo.
 */
export async function cargarFilasGastos(teamId: number, filtro: FiltroGastos, hasta: number): Promise<FilaGasto[]> {
  const [registrados, emitidos] = await Promise.all([
    listarCompras(teamId, { clase: 'gasto', desde: filtro.desde, hasta: filtro.hasta, limit: hasta, filtro }),
    listarGastosEcf(teamId, filtro.desde, filtro.hasta, hasta, filtro),
  ]);

  return [
    ...registrados.map((g): FilaGasto => {
      const info = analizarNcf(g.ncf);
      return {
        key: `r${g.id}`, fuente: 'r', id: g.id, fecha: g.fecha, proveedor: g.proveedorNombre ?? 'Sin proveedor', rnc: g.proveedorRnc,
        // Sin NCF se dice, no se deja un guion: es un gasto sin comprobante fiscal.
        comprobante: info.sinNcf ? 'Sin NCF' : g.ncf,
        tipo: info.valido ? `${info.nombre}` : info.sinNcf ? 'No va al 606' : 'Comprobante', categoria: g.categoriaLabel ?? '—',
        href: `/dashboard/compras/local/${g.id}`, anulado: g.estado === 'anulada', borrador: false,
        pagado: g.saldoCents === 0, saldoCents: g.saldoCents, metodo: g.formaPago === 'contado' ? g.metodoPago : null, cuenta: null,
        retencionesCents: g.retencionesCents, montoCents: g.montoTotal,
      };
    }),
    ...emitidos.map((g): FilaGasto => ({
      key: `e${g.id}`, fuente: 'e', id: g.id, fecha: g.fecha, proveedor: g.proveedor || 'Sin proveedor', rnc: g.rncProveedor,
      comprobante: g.encf && !g.encf.startsWith('BOR') ? g.encf : g.ncfProveedor,
      tipo: g.tipoEcf === '47' ? 'Pago al exterior (e47)' : 'Gasto menor (e43)', categoria: g.categoriaGasto || '—',
      href: g.estado === 'BORRADOR' ? `/dashboard/facturas/${g.id}/editar` : `/dashboard/facturas/${g.id}`,
      anulado: g.estado === 'ANULADO' || g.estado === 'RECHAZADO', borrador: g.estado === 'BORRADOR',
      pagado: g.saldoCents === 0, saldoCents: g.saldoCents,
      metodo: g.pagoMetodo, cuenta: g.pagoCuenta, retencionesCents: g.totalRetenciones, montoCents: g.montoTotal,
    })),
  ].sort(compararGastos);
}
