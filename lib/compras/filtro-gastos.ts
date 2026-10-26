/**
 * El filtro de la pantalla de Gastos, tal como viaja en la URL.
 *
 * Lo leen tres sitios —la pantalla, el Excel y la vista para imprimir/PDF— y
 * los tres tienen que entender lo mismo: si el Excel no aplicara un filtro que
 * la pantalla sí, el archivo diría otra cosa que lo que el usuario tiene
 * delante. Por eso se lee y se escribe solo aquí. Pura, sin BD.
 */

import { CATEGORIAS_COMPRA } from './categorias';

export type EstadoGasto = 'pagado' | 'por_pagar' | 'anulado';
/** De dónde sale el gasto: comprobante del proveedor, o e43/e47 que emite la empresa. */
export type TipoGasto = 'proveedor' | 'e43' | 'e47';

export interface FiltroGastos {
  /** YYYY-MM-DD, inclusive. */
  desde?: string;
  hasta?: string;
  /** Proveedor, RNC o comprobante. */
  q?: string;
  /** La etiqueta que se ve en pantalla; '-' = sin categoría. */
  categoria?: string;
  estado?: EstadoGasto;
  tipo?: TipoGasto;
}

export const ESTADOS_GASTO: { value: EstadoGasto; label: string }[] = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'anulado', label: 'Anulado' },
];

export const TIPOS_GASTO: { value: TipoGasto; label: string }[] = [
  { value: 'proveedor', label: 'Factura de proveedor' },
  { value: 'e43', label: 'Gasto menor (e43)' },
  { value: 'e47', label: 'Pago al exterior (e47)' },
];

/** Valor del filtro de categoría para «Sin categoría». */
export const SIN_CATEGORIA = '-';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(d).padStart(2, '0')}`;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function leer(sp: Params, k: string): string | undefined {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/**
 * Lee el filtro de los parámetros de la URL. Lo que no se entiende se ignora.
 * `?mes=YYYY-MM` sigue valiendo (enlaces viejos) y se traduce a su rango.
 */
export function leerFiltroGastos(sp: Params): FiltroGastos {
  const f: FiltroGastos = {};
  const mes = leer(sp, 'mes');
  const desde = leer(sp, 'desde');
  const hasta = leer(sp, 'hasta');
  if (desde && FECHA.test(desde)) f.desde = desde;
  if (hasta && FECHA.test(hasta)) f.hasta = hasta;
  if (!f.desde && !f.hasta && mes && MES.test(mes)) {
    f.desde = `${mes}-01`;
    f.hasta = ultimoDiaDelMes(mes);
  }
  const q = leer(sp, 'q');
  if (q) f.q = q.slice(0, 100);
  const categoria = leer(sp, 'categoria');
  if (categoria) f.categoria = categoria.slice(0, 120);
  const estado = leer(sp, 'estado');
  if (ESTADOS_GASTO.some((e) => e.value === estado)) f.estado = estado as EstadoGasto;
  const tipo = leer(sp, 'tipo');
  if (TIPOS_GASTO.some((t) => t.value === tipo)) f.tipo = tipo as TipoGasto;
  return f;
}

/** El filtro de vuelta a parámetros de URL, sin las claves vacías. */
export function filtroGastosAParams(f: FiltroGastos): URLSearchParams {
  const q = new URLSearchParams();
  if (f.desde) q.set('desde', f.desde);
  if (f.hasta) q.set('hasta', f.hasta);
  if (f.q) q.set('q', f.q);
  if (f.categoria) q.set('categoria', f.categoria);
  if (f.estado) q.set('estado', f.estado);
  if (f.tipo) q.set('tipo', f.tipo);
  return q;
}

/** ¿Hay algún filtro puesto? Cambia el texto de la lista vacía y de las tarjetas. */
export function hayFiltro(f: FiltroGastos): boolean {
  return Boolean(f.desde || f.hasta || f.q || f.categoria || f.estado || f.tipo);
}

/** Si el rango es justo un mes calendario, ese mes (YYYY-MM). */
export function mesDelRango(f: FiltroGastos): string | null {
  if (!f.desde || !f.hasta) return null;
  const mes = f.desde.slice(0, 7);
  return f.desde === `${mes}-01` && f.hasta === ultimoDiaDelMes(mes) ? mes : null;
}

export function rangoDeMes(mes: string): { desde: string; hasta: string } {
  return { desde: `${mes}-01`, hasta: ultimoDiaDelMes(mes) };
}

/**
 * Las claves del catálogo cuya etiqueta es esta. Los comprobantes de proveedor
 * guardan la clave y los e43/e47 el texto, así que el filtro se pide por la
 * etiqueta y cada consulta lo traduce a lo suyo.
 */
export function clavesDeCategoria(label: string): string[] {
  return CATEGORIAS_COMPRA.filter((c) => c.label === label).map((c) => c.clave);
}

/** Una línea legible del filtro, para el encabezado del Excel y del PDF. */
export function describirFiltroGastos(f: FiltroGastos, fmtFecha: (iso: string) => string): string {
  const partes: string[] = [];
  if (f.desde && f.hasta) partes.push(`Del ${fmtFecha(f.desde)} al ${fmtFecha(f.hasta)}`);
  else if (f.desde) partes.push(`Desde el ${fmtFecha(f.desde)}`);
  else if (f.hasta) partes.push(`Hasta el ${fmtFecha(f.hasta)}`);
  else partes.push('Todas las fechas');
  if (f.q) partes.push(`Búsqueda: «${f.q}»`);
  if (f.categoria) partes.push(`Categoría: ${f.categoria === SIN_CATEGORIA ? 'Sin categoría' : f.categoria}`);
  if (f.tipo) partes.push(`Tipo: ${TIPOS_GASTO.find((t) => t.value === f.tipo)?.label}`);
  if (f.estado) partes.push(`Estado: ${ESTADOS_GASTO.find((e) => e.value === f.estado)?.label}`);
  return partes.join(' · ');
}
