/**
 * lib/administracion-escolar/matricular-sigerd-plan.ts — lo que cada alumno
 * lleva y cuánto se le carga en «Matricular desde SIGERD».
 *
 * Las tres vistas de la pantalla (por sección, por alumno y por concepto)
 * cambian lo mismo: lo que cobra cada sección y lo propio de cada alumno. Aquí
 * están esas reglas y las cuentas, sin React, para que las tres digan los
 * mismos números y se puedan probar con montos conocidos.
 *
 * Los montos salen de `cuotasAlMatricular` con el plan de la sección y los
 * precios propios puestos (`aplicarPreciosPropios`): es la misma regla con la
 * que el servidor crea los cargos.
 *
 * Los que ya tienen matrícula salen en la misma lista. Su punto de partida no
 * es lo que cobra la sección sino lo que su matrícula ya tiene guardado
 * (`guardados`); lo que se les cambie se guarda como en «Servicios por alumno»
 * (`cambioDeMatricula`).
 */

import {
  aplicarPreciosPropios, tarifaDesdeEscrito, type LineaPlan,
} from '@/components/administracion-escolar/PlanCobroSelector';
import { cuotasAlMatricular, sumaCentavos } from './cuotas-al-matricular';

export interface PrecioPropio { conceptoId: number; montoCentavos: number }

/** Lo decidido para un alumno. Sin ajuste, lleva lo de su sección. */
export interface AjusteAlumno {
  conceptos: number[];
  /** Su tarifa en esos conceptos, en la misma unidad que `LineaPlan.montoCentavos`. */
  precios: PrecioPropio[];
}

/**
 * Si la sección cobra este concepto. Por defecto, los obligatorios sí y los
 * opcionales (uniforme, transporte) no; `cambiados` son los que alguien
 * alternó a mano en los chips de la sección.
 */
export const cobraEnSeccion = (l: Pick<LineaPlan, 'conceptoId' | 'opcional'>, cambiados?: Set<number>) =>
  !l.opcional !== (cambiados?.has(l.conceptoId) ?? false);

export const conceptosDeSeccion = (lineas: LineaPlan[], cambiados?: Set<number>) =>
  lineas.filter((l) => cobraEnSeccion(l, cambiados)).map((l) => l.conceptoId);

/** Igual que lo de su sección y sin precios propios: no hace falta guardarle nada aparte. */
export const igualASeccion = (deSeccion: number[] | null, a: AjusteAlumno) => deSeccion != null
  && a.precios.length === 0
  && a.conceptos.length === deSeccion.length && deSeccion.every((c) => a.conceptos.includes(c));

/**
 * Cuánto se le carga hoy, cuántos cargos nacen y cuánto suma el año.
 * `corte` es hasta dónde se carga ya: lo emitido antes o ese día nace como cargo.
 */
export function cuentaDe(lineas: LineaPlan[], conceptos: Iterable<number>, precios: PrecioPropio[], corte: string) {
  const propios = new Map(precios.map((p) => [p.conceptoId, p.montoCentavos]));
  const plan = aplicarPreciosPropios(lineas, propios);
  const { ahora, despues } = cuotasAlMatricular(plan, conceptos, corte);
  const hoy = sumaCentavos(ahora);
  return { hoy, cargos: ahora.length, anio: hoy + sumaCentavos(despues) };
}

/** Lo que pone un solo concepto en la cuenta de un alumno (vista por concepto). */
export const cuentaDeConcepto = (linea: LineaPlan, precios: PrecioPropio[], corte: string) =>
  cuentaDe([linea], [linea.conceptoId], precios, corte);

const soloDe = (conceptos: number[], precios: PrecioPropio[]) =>
  precios.filter((p) => conceptos.includes(p.conceptoId));

/**
 * Dar o quitar un concepto a un alumno. Quitarlo se lleva también su precio
 * propio. `null` si ya estaba así.
 */
export function conConcepto(actuales: number[], precios: PrecioPropio[], conceptoId: number, cobrar: boolean): AjusteAlumno | null {
  if (actuales.includes(conceptoId) === cobrar) return null;
  const conceptos = cobrar ? [...actuales, conceptoId] : actuales.filter((c) => c !== conceptoId);
  return { conceptos, precios: soloDe(conceptos, precios) };
}

/** Un paquete: lleva justo sus conceptos que tengan tarifa en su sección. */
export function conPaquete(lineas: LineaPlan[], paquete: number[], precios: PrecioPropio[]): AjusteAlumno {
  const quiere = new Set(paquete);
  const conceptos = lineas.filter((l) => quiere.has(l.conceptoId)).map((l) => l.conceptoId);
  return { conceptos, precios: soloDe(conceptos, precios) };
}

/**
 * Un precio propio escrito como en «Cambiar precio» del alumno: lo de cada
 * cuota, salvo en los conceptos cuyas cuotas no pesan igual (el total). Se
 * guarda como tarifa con `tarifaDesdeEscrito`, igual que allí. Si queda la
 * tarifa de su sección, se le quita el precio propio. `null` si no lleva el
 * concepto.
 */
export function conPrecio(linea: LineaPlan, conceptos: number[], precios: PrecioPropio[], escritoCentavos: number): AjusteAlumno | null {
  if (!conceptos.includes(linea.conceptoId)) return null;
  const tarifa = tarifaDesdeEscrito(linea, escritoCentavos);
  const otros = precios.filter((p) => p.conceptoId !== linea.conceptoId);
  return {
    conceptos,
    precios: tarifa === linea.montoCentavos ? otros : [...otros, { conceptoId: linea.conceptoId, montoCentavos: tarifa }],
  };
}

/**
 * Toda la sección con o sin un concepto. Cambia lo de la sección y, a quien ya
 * tenía lo suyo, también se lo da o se lo quita; quien queda igual que la
 * sección vuelve a «sin cambios» (`null` en `ajustes`).
 *
 * A los ya matriculados de la sección (`matriculados`: id → lo guardado en su
 * matrícula) también se les da o se les quita: «a la sección» es a todos. Para
 * ellos «sin cambios» es quedar como su matrícula, no como la sección.
 */
export function seccionConConcepto(
  lineas: LineaPlan[], cambiados: Set<number> | undefined, ajustes: Map<number, AjusteAlumno>,
  conceptoId: number, cobrar: boolean, matriculados: Map<number, number[]> = new Map(),
): { cambiados: Set<number>; ajustes: Map<number, AjusteAlumno | null> } | null {
  const linea = lineas.find((l) => l.conceptoId === conceptoId);
  if (!linea) return null;
  const nuevos = new Set(cambiados);
  if (cobraEnSeccion(linea, nuevos) !== cobrar) {
    if (nuevos.has(conceptoId)) nuevos.delete(conceptoId); else nuevos.add(conceptoId);
  }
  const deSeccion = conceptosDeSeccion(lineas, nuevos);
  const resultado = new Map<number, AjusteAlumno | null>();
  const con = (actuales: number[]) =>
    (cobrar ? [...new Set([...actuales, conceptoId])] : actuales.filter((c) => c !== conceptoId));
  for (const [id, a] of ajustes) {
    if (matriculados.has(id)) continue;
    const conceptos = con(a.conceptos);
    const ajuste = { conceptos, precios: soloDe(conceptos, a.precios) };
    resultado.set(id, igualASeccion(deSeccion, ajuste) ? null : ajuste);
  }
  for (const [id, guardados] of matriculados) {
    const a = ajustes.get(id);
    const conceptos = con(a?.conceptos ?? guardados);
    const ajuste = { conceptos, precios: soloDe(conceptos, a?.precios ?? []) };
    resultado.set(id, igualASeccion(guardados, ajuste) ? null : ajuste);
  }
  return { cambiados: nuevos, ajustes: resultado };
}

/**
 * Lo que cambia en la matrícula de un alumno ya matriculado: qué conceptos se
 * agregan y cuáles se quitan respecto de lo guardado. `null` si nada.
 */
export function cambioDeMatricula(guardados: number[], ajuste: AjusteAlumno | undefined) {
  if (!ajuste) return null;
  const agregar = ajuste.conceptos.filter((c) => !guardados.includes(c));
  const quitar = guardados.filter((c) => !ajuste.conceptos.includes(c));
  return agregar.length + quitar.length > 0 ? { agregar, quitar } : null;
}
