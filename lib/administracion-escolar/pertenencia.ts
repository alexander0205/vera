/**
 * Validación de pertenencia al team para los ids que llegan del cliente.
 *
 * Las rutas de escritura del módulo reciben estudianteId, matriculaId,
 * conceptoId, etc. en el body. Guardar la fila con el teamId de quien llama NO
 * alcanza: si el id apunta a otra empresa, queda una fila propia enganchada a
 * datos ajenos, y basta con que un join la muestre para filtrar el nombre de un
 * estudiante de otro colegio. Antes de insertar hay que confirmar que cada id
 * es de casa.
 *
 * Se responde 404 (no 403) a propósito: para quien pregunta, un id de otra
 * empresa y un id inexistente son lo mismo.
 */

import 'server-only';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarMaterias,
  adminEscolarEstudiantes,
  adminEscolarTutores,
  adminEscolarMatriculas,
  adminEscolarConceptosPago,
  adminEscolarCargos,
} from '@/lib/db/schema';

const TABLAS = {
  periodo:    { tabla: adminEscolarPeriodos,      etiqueta: 'Período' },
  curso:      { tabla: adminEscolarCursos,        etiqueta: 'Curso' },
  materia:    { tabla: adminEscolarMaterias,      etiqueta: 'Materia' },
  estudiante: { tabla: adminEscolarEstudiantes,   etiqueta: 'Estudiante' },
  tutor:      { tabla: adminEscolarTutores,       etiqueta: 'Tutor' },
  matricula:  { tabla: adminEscolarMatriculas,    etiqueta: 'Matrícula' },
  concepto:   { tabla: adminEscolarConceptosPago, etiqueta: 'Concepto' },
  cargo:      { tabla: adminEscolarCargos,        etiqueta: 'Cargo' },
} as const;

export type EntidadEscolar = keyof typeof TABLAS;

/**
 * Referencias a validar. El valor es `unknown` a propósito: viene de un JSON del
 * cliente, así que puede llegar como string, objeto o lo que sea. Los
 * `null`/`undefined` se ignoran (campos opcionales); cualquier otra cosa que no
 * sea un id válido se RECHAZA — nunca se salta.
 */
export type Referencias = Partial<Record<EntidadEscolar, unknown>>;

/** Un id válido es un entero positivo, venga como número o como string. */
function comoId(valor: unknown): number | null {
  const n = typeof valor === 'string' || typeof valor === 'number' ? Number(valor) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type ResultadoPertenencia =
  | { ok: true;  ids: Partial<Record<EntidadEscolar, number>> }
  | { ok: false; error: string };

/**
 * Comprueba que cada id referenciado exista DENTRO del team.
 *
 * Devuelve los ids ya normalizados a número para que quien llama los inserte
 * así y no el valor crudo del JSON. Ojo con esto: si aquí se ignorara un id por
 * no ser `typeof 'number'`, bastaría con mandarlo entre comillas ("501") para
 * saltarse la validación entera — Postgres luego castea el string a int4 y la
 * fila queda apuntando a otra empresa.
 */
export async function validarPertenencia(
  teamId: number,
  refs: Referencias,
): Promise<ResultadoPertenencia> {
  const ids: Partial<Record<EntidadEscolar, number>> = {};
  const pendientes: [EntidadEscolar, number][] = [];

  for (const [clave, valor] of Object.entries(refs) as [EntidadEscolar, unknown][]) {
    if (valor == null) continue;
    const id = comoId(valor);
    if (id == null) return { ok: false, error: `${TABLAS[clave].etiqueta} inválido` };
    ids[clave] = id;
    pendientes.push([clave, id]);
  }

  if (pendientes.length === 0) return { ok: true, ids };

  const resultados = await Promise.all(
    pendientes.map(async ([clave, id]) => {
      const { tabla } = TABLAS[clave];
      const [row] = await db
        .select({ id: tabla.id })
        .from(tabla)
        .where(and(eq(tabla.id, id), eq(tabla.teamId, teamId)))
        .limit(1);
      return { clave, existe: Boolean(row) };
    }),
  );

  const faltante = resultados.find(r => !r.existe);
  if (faltante) return { ok: false, error: `${TABLAS[faltante.clave].etiqueta} no encontrado` };
  return { ok: true, ids };
}
