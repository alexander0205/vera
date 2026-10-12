/**
 * De qué cuenta salió el dinero de un gasto o de un pago a proveedor.
 *
 * El otro lado del asiento (a qué cuenta va el gasto) lo resuelve
 * `./cuenta-gasto`. Este archivo resuelve el haber: caja, banco, o lo que la
 * empresa haya puesto como cuenta de un método de pago.
 *
 * Dos respuestas, de más específica a más general:
 *
 *   1. la cuenta que quien registró eligió en ESE comprobante o pago;
 *   2. la cuenta del método de pago, de la configuración contable, que es como
 *      funcionaba antes: efectivo y cheque a caja, lo demás al banco.
 *
 * **Por qué no vale cualquier cuenta del catálogo.** Un haber contra Ingresos o
 * contra un gasto cuadra igual y no lo nota nadie hasta el cierre: quedaría un
 * ingreso negativo. Así que solo se ofrecen las cuentas que de verdad pueden
 * soltar dinero —caja, bancos y cobros por liquidar— más las que la empresa ya
 * eligió para sus métodos de pago, que es donde cada contador mete lo suyo (una
 * línea de crédito, por ejemplo). El resto del catálogo no aparece.
 *
 * Puras: quien las llama arma los mapas con una consulta.
 */

import { CLAVES_SIN_COBRO, type ClaveMetodo } from './metodos';
import type { CuentaCatalogo } from './cuenta-gasto';

/**
 * Códigos que pueden soltar dinero en el catálogo base y en el de un contador:
 * 1101 Caja, 1102 Bancos, 1106 Cobros por liquidar, con sus subcuentas. Los
 * prefijos aguantan ambos catálogos; los códigos de pasivo no, porque 2105 es
 * «Sueldos por pagar» en el base y «Línea de crédito» en el de Luis.
 */
export const PREFIJOS_SALIDA = ['1101', '1102', '1106'] as const;

/** De dónde salió la cuenta; se muestra en el formulario. */
export type OrigenCuentaSalida = 'comprobante' | 'metodo';

export interface CuentaSalidaElegida {
  cuenta: CuentaCatalogo;
  origen: OrigenCuentaSalida;
}

/** Si esta cuenta puede ser el haber de un pago. */
export function esCuentaDeSalida(cuenta: CuentaCatalogo, configuradas: ReadonlySet<number> = new Set()): boolean {
  return PREFIJOS_SALIDA.some((p) => cuenta.codigo.startsWith(p)) || configuradas.has(cuenta.id);
}

/**
 * Las cuentas que la empresa configuró para métodos que mueven dinero de
 * verdad. `saldo_favor` y `nota_credito` no son un pago: su cuenta no entra.
 */
export function cuentasDeMetodos(metodos: readonly { clave: ClaveMetodo; cuentaId: number }[]): Set<number> {
  return new Set(metodos.filter((m) => !CLAVES_SIN_COBRO.includes(m.clave)).map((m) => m.cuentaId));
}

export interface OpcionesCuentaSalida {
  /** La elegida al registrar, si la hubo. */
  elegidaId?: number | null;
  /** La del método de pago, de la configuración contable. */
  delMetodoId?: number | null;
  /** Las cuentas que pueden soltar dinero en esta empresa, por id. */
  salida: Map<number, CuentaCatalogo>;
}

/**
 * La cuenta de la que sale el dinero, o null si la empresa no tiene ninguna
 * usable. Una cuenta elegida que después desactivaron, o que nunca pudo soltar
 * dinero, se salta: el asiento sigue saliendo por la del método.
 */
export function elegirCuentaSalida(o: OpcionesCuentaSalida): CuentaSalidaElegida | null {
  const candidatas: { id: number | null | undefined; origen: OrigenCuentaSalida }[] = [
    { id: o.elegidaId,   origen: 'comprobante' },
    { id: o.delMetodoId, origen: 'metodo' },
  ];
  for (const c of candidatas) {
    const cuenta = c.id ? o.salida.get(c.id) : undefined;
    if (cuenta) return { cuenta, origen: c.origen };
  }
  return null;
}
