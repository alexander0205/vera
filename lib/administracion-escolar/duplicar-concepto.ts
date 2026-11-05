/**
 * Duplicar un concepto: arrancar uno nuevo con la configuración de otro y
 * cambiarle solo lo que difiere.
 *
 * Montar «Evaluación final» desde cero, con «Evaluación inicial» ya puesta,
 * eran veinte casillas —frecuencia, días de emisión y de pago, mora, avisos,
 * canales, beca— y el calendario de cuotas mes por mes, para terminar con lo
 * mismo y otro nombre.
 *
 * Se copian la configuración y el calendario de cuotas de todos los años. NO
 * se copian:
 *  - las tarifas: un concepto con precio empieza a devengar cargos a los
 *    alumnos a los que les toca. La copia nace sin precio y no le cobra a nadie
 *    hasta que alguien se lo pone en Tarifas, a sabiendas;
 *  - el producto de facturación: es el nombre con que sale la factura, y la
 *    copia facturaría «Evaluación final» con el producto de la inicial.
 *
 * Puro, sin base ni red, para poder probarlo: ver
 * `tests/unit/duplicar-concepto.test.ts`.
 */

import type { adminEscolarConceptosPago, adminEscolarConceptoCuotas } from '@/lib/db/schema';

type Concepto = typeof adminEscolarConceptosPago.$inferSelect;
type Cuota = typeof adminEscolarConceptoCuotas.$inferSelect;

/** Mismo largo que la columna `nombre`. */
export const LARGO_NOMBRE = 80;

/** Mismo largo que la columna `etiqueta` de la cuota, más corta que el nombre. */
const LARGO_ETIQUETA = 60;

/** Lo que se inserta como concepto nuevo. */
export function valoresDeLaCopia(origen: Concepto, nombre: string, orden: number) {
  const {
    id: _id, createdAt: _creado, updatedAt: _actualizado, productId: _producto, ...config
  } = origen;
  return { ...config, nombre, orden, productId: null, activo: true };
}

/**
 * Las cuotas del concepto nuevo, de todos los años.
 *
 * La del pago único se llama como el concepto (así la genera el calendario y
 * así la renombra el PATCH): en la copia se llama como la copia, o el recibo
 * del padre diría «Evaluación inicial» en el cargo de la final.
 */
export function cuotasDeLaCopia(origen: Concepto, cuotas: Cuota[], conceptoId: number, nombre: string) {
  return cuotas.map((c) => ({
    teamId: c.teamId,
    conceptoId,
    periodoId: c.periodoId,
    numero: c.numero,
    etiqueta: origen.frecuencia === 'unico' && c.etiqueta === origen.nombre
      ? nombre.slice(0, LARGO_ETIQUETA) : c.etiqueta,
    mes: c.mes,
    fechaEmision: c.fechaEmision,
    porcentajeMilesimas: c.porcentajeMilesimas,
    activo: c.activo,
  }));
}

/** Para comparar nombres como los ve una persona: sin mayúsculas ni espacios de más. */
export function claveDeNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

/**
 * El nombre que se propone: «X (copia)», y «X (copia 2)» si ya existe.
 *
 * Dos conceptos con el mismo nombre son dos botones iguales en Tarifas y en la
 * matrícula, y no hay forma de saber cuál es cuál.
 */
export function nombreSugerido(nombre: string, existentes: string[]): string {
  const usados = new Set(existentes.map(claveDeNombre));
  for (let n = 1; ; n++) {
    const sufijo = n === 1 ? ' (copia)' : ` (copia ${n})`;
    const candidato = `${nombre.trim().slice(0, LARGO_NOMBRE - sufijo.length)}${sufijo}`;
    if (!usados.has(claveDeNombre(candidato))) return candidato;
  }
}
