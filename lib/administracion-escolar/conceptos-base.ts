import type { Frecuencia } from './calendario';

/**
 * Los conceptos con los que arranca un colegio.
 *
 * Salen de mirar lo que Andrés Bello factura de verdad: la colegiatura se cobra
 * mes a mes, y todo lo demás —inscripción, materiales, uniformes, evaluación de
 * ingreso— es de una sola vez al año. Esa distinción es lo único que hay que
 * acertar, porque de ella depende si se generan diez cuotas o una.
 */

export interface ConceptoBase {
  nombre: string;
  tipo: string;
  frecuencia: Frecuencia;
  /** Sobre este se aplican las becas. Solo la mensualidad. */
  admiteBeca: boolean;
}

export const CONCEPTOS_BASE: ConceptoBase[] = [
  { nombre: 'Colegiatura',        tipo: 'mensualidad', frecuencia: 'mensual', admiteBeca: true },
  { nombre: 'Inscripción',        tipo: 'inscripcion', frecuencia: 'unico',   admiteBeca: false },
  { nombre: 'Materiales gastables', tipo: 'otro',      frecuencia: 'unico',   admiteBeca: false },
  { nombre: 'Uniformes',          tipo: 'uniforme',    frecuencia: 'unico',   admiteBeca: false },
];

/**
 * Adivina la recurrencia por el nombre, para prellenar el interruptor cuando se
 * escribe un concepto nuevo o se trae uno del catálogo de facturación. Es una
 * sugerencia: quien lo crea decide.
 */
export function pareceMensual(nombre: string): boolean {
  return /colegiatura|mensualidad|cuota|mensual/i.test(nombre);
}
