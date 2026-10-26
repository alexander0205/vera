import type { ReactNode } from 'react';
import type { LineaPlan } from '@/components/administracion-escolar/PlanCobroSelector';
import type { AjusteAlumno } from '@/lib/administracion-escolar/matricular-sigerd-plan';

export { cobraEnSeccion } from '@/lib/administracion-escolar/matricular-sigerd-plan';

/**
 * Lo que comparten las tres formas de ver «Matricular desde SIGERD» (por
 * sección, por alumno y por concepto): los datos, cómo se lee si un alumno
 * lleva un concepto y las piezas de la lista.
 */

export interface Alumno {
  id: number; nombre: string; sinResponsable: boolean;
  /** Ya tiene matrícula activa este año: sale para cambiarle lo que lleva. */
  matriculaId?: number;
  /** Lo que su matrícula cobra hoy (solo si ya está matriculado). */
  conceptos?: number[];
}

export const esMatriculado = (a: Pick<Alumno, 'matriculaId'>) => a.matriculaId != null;
export interface Grupo {
  cursoId: number; curso: string; servicio: string; grado: string; seccion: string; tanda: string | null;
  estudiantes: Alumno[];
}

export type PlanSeccion =
  | { estado: 'cargando' }
  | { estado: 'listo'; lineas: LineaPlan[] }
  | { estado: 'error'; mensaje: string };

/** Lo que se decidió para un alumno al abrirlo. Sin entrada, va con lo de su sección. */
export type Ajuste = AjusteAlumno;

/** Cuánto se le carga a un alumno hoy y en el año. */
export interface Cuenta { hoy: number; cargos: number; anio: number }

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-DO');

export const iniciales = (nombre: string) => {
  const p = nombre.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ''}${p[p.length > 2 ? 2 : 1]?.[0] ?? ''}`.toUpperCase() || '—';
};

// Un color por alumno, siempre el mismo: ayuda a no perder la fila al bajar.
const TONOS = [
  'bg-zero-100 text-zero-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
];
export const tono = (id: number) => TONOS[id % TONOS.length];

export const titulo = (g: Pick<Grupo, 'grado' | 'seccion' | 'tanda'>) =>
  `${g.grado}${g.seccion ? ` — Sección ${g.seccion}` : ''}`;

/** Montos de las tablas: sin centavos, para que quepan. */
export const rdCorto = (centavos: number) => `RD$${Math.round(centavos / 100).toLocaleString('es-DO')}`;

/** El precio de una línea como se lee en la lista: «RD$5,000/cuota» o «RD$1,000». */
export const precioDeLinea = (l: Pick<LineaPlan, 'montoCentavos' | 'precioPorCuota' | 'cuotas'>, centavos = l.montoCentavos) =>
  `${rdCorto(centavos)}${l.cuotas.length > 1 ? (l.precioPorCuota ? '/cuota' : ' en el año') : ''}`;

export function Chip({ tono: t, children }: { tono: 'gris' | 'ambar' | 'rojo' | 'verde' | 'azul'; children: ReactNode }) {
  const c = t === 'ambar' ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : t === 'verde' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : t === 'rojo' ? 'bg-red-50 text-red-700 ring-red-200'
    : t === 'azul' ? 'bg-zero-50 text-zero-700 ring-zero-200'
    : 'bg-gray-100 text-gray-600 ring-gray-200';
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${c}`}>{children}</span>;
}
