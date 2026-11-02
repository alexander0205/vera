/**
 * Lo que «Matricular desde SIGERD» guarda solo mientras se trabaja (tabla
 * `admin_escolar_borradores`, migración 0216) y cómo se vuelve a poner.
 *
 * Solo lo que la pantalla decide y no está guardado en otra parte: los
 * cambios de cada alumno, los conceptos alternados en cada sección, quién no
 * se matricula ahora, la fecha de inscripción y el curso de Zero elegido a
 * quien SIGERD no ubica. La familia y los pagos se guardan al momento, no
 * pasan por aquí.
 *
 * Al volver se descarta lo que ya no aplica: un alumno o una sección que ya
 * no están en la lista (se matricularon, o SIGERD los movió).
 */

import type { AjusteAlumno } from './matricular-sigerd-plan';

export interface BorradorLote {
  version: 1;
  fecha: string | null;
  fuera: number[];
  /** Por sección (`cursoId`), los conceptos alternados respecto de lo de por defecto. */
  cambiadosSeccion: Record<string, number[]>;
  /** Por alumno, lo decidido en su panel. */
  ajustes: Record<string, AjusteAlumno>;
  /** Por alumno «sin curso», la sección de Zero que se le eligió. Opcional: los borradores de antes no la traen. */
  ubicados?: Record<string, number>;
}

export interface EstadoLote {
  fecha: string | null;
  fuera: Set<number>;
  cambiadosSeccion: Map<number, Set<number>>;
  ajustes: Map<number, AjusteAlumno>;
  /** Alumno → sección de Zero, para quien SIGERD no ubica. */
  ubicados: Map<number, number>;
}

/** Nada decidido: no hace falta borrador. */
export const estaVacio = (e: EstadoLote) =>
  e.fecha == null && e.fuera.size === 0 && e.ajustes.size === 0 && e.ubicados.size === 0
  && [...e.cambiadosSeccion.values()].every((s) => s.size === 0);

export function aBorrador(e: EstadoLote): BorradorLote {
  return {
    version: 1,
    fecha: e.fecha,
    fuera: [...e.fuera],
    cambiadosSeccion: Object.fromEntries(
      [...e.cambiadosSeccion].filter(([, s]) => s.size > 0).map(([id, s]) => [String(id), [...s]])),
    ajustes: Object.fromEntries([...e.ajustes].map(([id, a]) => [String(id), a])),
    ubicados: Object.fromEntries([...e.ubicados].map(([id, c]) => [String(id), c])),
  };
}

const enteros = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];

/**
 * El borrador, de vuelta a estado, quedándose solo con los alumnos y las
 * secciones que siguen en pantalla. `null` si no es un borrador que se entienda.
 */
export function deBorrador(datos: unknown, vigentes: { alumnos: Set<number>; secciones: Set<number> }): EstadoLote | null {
  if (!datos || typeof datos !== 'object') return null;
  const b = datos as Partial<BorradorLote>;
  if (b.version !== 1) return null;

  const ajustes = new Map<number, AjusteAlumno>();
  for (const [k, a] of Object.entries(b.ajustes ?? {})) {
    const id = Number(k);
    if (!vigentes.alumnos.has(id) || !a || typeof a !== 'object') continue;
    const precios = Array.isArray(a.precios)
      ? a.precios
        .map((p) => ({ conceptoId: Number(p?.conceptoId), montoCentavos: Number(p?.montoCentavos) }))
        .filter((p) => Number.isInteger(p.conceptoId) && Number.isFinite(p.montoCentavos) && p.montoCentavos >= 0)
      : [];
    const pct = Number((a as AjusteAlumno).beca?.porcentaje);
    const beca = Number.isFinite(pct) && pct > 0 && pct <= 100
      ? { porcentaje: pct, motivo: typeof a.beca?.motivo === 'string' ? a.beca.motivo : null } : undefined;
    ajustes.set(id, { conceptos: enteros(a.conceptos), precios, ...(beca ? { beca } : {}) });
  }

  const cambiadosSeccion = new Map<number, Set<number>>();
  for (const [k, ids] of Object.entries(b.cambiadosSeccion ?? {})) {
    const id = Number(k);
    if (vigentes.secciones.has(id)) cambiadosSeccion.set(id, new Set(enteros(ids)));
  }

  const ubicados = new Map<number, number>();
  for (const [k, c] of Object.entries(b.ubicados ?? {})) {
    const id = Number(k);
    const curso = Number(c);
    if (vigentes.alumnos.has(id) && vigentes.secciones.has(curso)) ubicados.set(id, curso);
  }

  return {
    fecha: typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : null,
    fuera: new Set(enteros(b.fuera).filter((id) => vigentes.alumnos.has(id))),
    cambiadosSeccion,
    ajustes,
    ubicados,
  };
}
