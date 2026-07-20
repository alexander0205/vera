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

/** Referencias a validar. Los `null`/`undefined` se ignoran (campos opcionales). */
export type Referencias = Partial<Record<EntidadEscolar, number | null | undefined>>;

/**
 * Comprueba que cada id referenciado exista DENTRO del team.
 * Devuelve `null` si todo está en orden, o el mensaje de error de la primera
 * referencia que no lo esté.
 */
export async function validarPertenencia(
  teamId: number,
  refs: Referencias,
): Promise<string | null> {
  const pendientes = (Object.entries(refs) as [EntidadEscolar, number | null | undefined][])
    .filter((entry): entry is [EntidadEscolar, number] => typeof entry[1] === 'number');

  if (pendientes.length === 0) return null;

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
  return faltante ? `${TABLAS[faltante.clave].etiqueta} no encontrado` : null;
}
