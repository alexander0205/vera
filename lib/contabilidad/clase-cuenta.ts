/**
 * Qué se puede cambiar de una cuenta que ya tiene asientos encima.
 *
 * El caso real: un contador crea «6301 Impuesto a los activos» y le pone clase
 * **activo** en vez de **gasto**. Le mete tres apuntes y entonces el sistema no
 * lo deja corregirlo, así que el gasto se queda escondido en el balance y no
 * sale en el estado de resultados. Tenía que pedirnos el cambio por dentro.
 *
 * Cambiar la clase de una cuenta NO mueve ningún apunte: el debe y el haber se
 * quedan donde están. Lo único que cambia es en qué sección del reporte sale la
 * cuenta, que es justo lo que se quiere arreglar. Así que se permite.
 *
 * Lo que sí hace daño, y aquí se veta:
 *
 *   1. **Invertir la naturaleza.** Los reportes suman (debe − haber) para las
 *      deudoras y (haber − debe) para las acreedoras. Darle la vuelta con
 *      apuntes encima le cambia el signo al saldo de golpe y a toda su
 *      historia. Eso no es corregir una clasificación, es otra cuenta: se crea
 *      y se reclasifica con un asiento.
 *   2. **Tocar un ejercicio ya cerrado.** El cierre declaró un resultado con
 *      esta cuenta en la sección donde estaba; moverla después deja el cierre
 *      sin cuadrar contra lo que se declaró.
 *
 * Pura: quien la llama trae los datos con dos consultas.
 */

import type { NaturalezaCuenta, TipoCuenta } from './catalogo-base';

export interface CambioDeClase {
  tipoActual:       TipoCuenta;
  tipoNuevo:        TipoCuenta;
  naturalezaActual: NaturalezaCuenta;
  /** La que quedaría al guardar; sin tocarla, la misma de ahora. */
  naturalezaNueva:  NaturalezaCuenta;
  conMovimientos:   boolean;
  /** El ejercicio cerrado que cubre apuntes de esta cuenta, si lo hay. */
  ejercicioCerrado: number | null;
}

/** Por qué no se puede, o null si sí se puede. */
export type VetoDeClase = 'naturaleza-invertida' | 'ejercicio-cerrado' | null;

export function vetoDeClase(c: CambioDeClase): VetoDeClase {
  const cambiaTipo = c.tipoNuevo !== c.tipoActual;
  const cambiaNaturaleza = c.naturalezaNueva !== c.naturalezaActual;
  if (!cambiaTipo && !cambiaNaturaleza) return null;
  if (!c.conMovimientos) return null;
  if (cambiaNaturaleza) return 'naturaleza-invertida';
  if (c.ejercicioCerrado !== null) return 'ejercicio-cerrado';
  return null;
}
