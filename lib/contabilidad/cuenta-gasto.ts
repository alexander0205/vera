/**
 * A qué cuenta del catálogo va una línea de gasto.
 *
 * Cuatro respuestas posibles, de más específica a más general:
 *
 *   1. la cuenta que quien registró eligió en ESE comprobante;
 *   2. la que la empresa configuró para esa categoría (contabilidad_config_gastos);
 *   3. la del código que `lib/compras/categorias` le pone a la categoría (6114
 *      para materiales, 6110 para honorarios…), que es como funcionaba antes;
 *   4. la cuenta general de gastos de la configuración, y si tampoco está, la 6101.
 *
 * Solo entran cuentas imputables y activas: una cuenta de agrupación no recibe
 * asientos, y una desactivada dejaría el asiento sin poder cuadrar. Por eso cada
 * candidata se busca en `imputables`; la que no esté ahí se salta y se pasa a la
 * siguiente, que es lo que hace que desactivar una cuenta no rompa el registro.
 *
 * Pura: quien la llama arma los mapas con una consulta.
 */

import { categoriaCompra } from '@/lib/compras/categorias';

export interface CuentaCatalogo {
  id: number;
  codigo: string;
  nombre: string;
}

/** De dónde salió la cuenta; se muestra en el formulario y en la configuración. */
export type OrigenCuentaGasto = 'linea' | 'configurada' | 'catalogo' | 'general';

export interface CuentaGastoElegida {
  cuenta: CuentaCatalogo;
  origen: OrigenCuentaGasto;
}

export interface OpcionesCuentaGasto {
  /** Clave de CATEGORIAS_COMPRA. */
  categoria: string | null | undefined;
  /** La elegida al registrar el comprobante, si la hubo. */
  cuentaLineaId?: number | null;
  /** Categoría → cuenta, de la configuración de la empresa. */
  configuradas?: Map<string, number>;
  /** La cuenta general de gastos de la configuración contable. */
  general?: number | null;
  /** Las cuentas imputables y activas de la empresa, por id. */
  imputables: Map<number, CuentaCatalogo>;
  /** Las mismas, por código. */
  porCodigo: Map<string, CuentaCatalogo>;
}

/** La cuenta de una línea de gasto, o null si la empresa no tiene ninguna usable. */
export function elegirCuentaGasto(o: OpcionesCuentaGasto): CuentaGastoElegida | null {
  const candidatas: { id: number | null | undefined; origen: OrigenCuentaGasto }[] = [
    { id: o.cuentaLineaId, origen: 'linea' },
    { id: o.categoria ? o.configuradas?.get(o.categoria) : null, origen: 'configurada' },
    { id: o.porCodigo.get(categoriaCompra(o.categoria)?.cuentaCodigo ?? '')?.id, origen: 'catalogo' },
    { id: o.general, origen: 'general' },
    { id: o.porCodigo.get(CUENTA_GASTO_GENERAL)?.id, origen: 'general' },
  ];
  for (const c of candidatas) {
    const cuenta = c.id ? o.imputables.get(c.id) : undefined;
    if (cuenta) return { cuenta, origen: c.origen };
  }
  return null;
}

/** La cuenta de gastos del catálogo base, el último recurso. */
export const CUENTA_GASTO_GENERAL = '6101';
