/**
 * Reglas de «Asignar a estudiantes» en Configuración escolar > Tarifas.
 *
 * Cada fila de Tarifas dice lo que cuesta un concepto en todo el colegio o en
 * un servicio, grado o sección. La acción de la fila añade ESE concepto al plan de los alumnos de
 * ESA fila (`conceptos_ids` de la matrícula): el concepto y el curso no se
 * eligen, y el monto no se teclea. Sus cuotas se vuelven cargo en la fecha de
 * su calendario, igual que una colegiatura, y las que ya pasaron se crean al
 * confirmar (`POST /conceptos/asignar`).
 *
 * Aquí vive lo que se puede probar sin pantalla. Pruebas en
 * `tests/unit/cargo-desde-tarifa.test.ts`.
 */

/** La fila de la que salió la acción: el colegio, un servicio, un grado o una sección. */
export interface ObjetivoDeTarifa {
  tipo: 'colegio' | 'servicio' | 'grado' | 'seccion';
  id: number;
}

interface GradoDeEstructura { id: number; servicioId: number }
interface SeccionDeEstructura { id: number; gradoId: number }

/**
 * Las secciones que entran en la fila (`cursoIds`): el colegio son todas, un
 * servicio todas las de sus grados, un grado las suyas y una sección ella misma.
 *
 * Una lista VACÍA no se puede mandar: quien llama tiene que tratarla como
 * «esta fila no tiene a nadie» y no preguntar (ver `motivoParaNoCargar`).
 */
export function seccionesDelObjetivo(
  objetivo: ObjetivoDeTarifa,
  grados: GradoDeEstructura[],
  secciones: SeccionDeEstructura[],
): number[] {
  if (objetivo.tipo === 'colegio') return secciones.map((s) => s.id);
  if (objetivo.tipo === 'seccion') {
    return secciones.some((s) => s.id === objetivo.id) ? [objetivo.id] : [];
  }
  const gradosDelObjetivo = objetivo.tipo === 'grado'
    ? grados.filter((g) => g.id === objetivo.id)
    : grados.filter((g) => g.servicioId === objetivo.id);
  const ids = new Set(gradosDelObjetivo.map((g) => g.id));
  return secciones.filter((s) => ids.has(s.gradoId)).map((s) => s.id);
}

/**
 * Por qué esta fila no puede asignar, para decirlo en el botón antes de que
 * nadie lo pulse. `null` = se puede.
 *
 * Solo paran las dos cosas que lo hacen imposible: sin precio no hay nada que
 * cobrar y sin secciones no hay a quién. El tipo de cobro NO para: a un alumno
 * que entró tarde también se le puede poner la colegiatura desde aquí. Lo que
 * la colegiatura tiene de delicado se trata alumno por alumno
 * (`otraColegiatura`).
 */
export function motivoParaNoCargar(d: {
  montoCentavos: number | null;
  cursoIds: number[];
}): string | null {
  if (d.montoCentavos === null || d.montoCentavos <= 0) {
    return 'Ponle precio a esta fila para poder cobrárselo a sus alumnos.';
  }
  if (d.cursoIds.length === 0) {
    return 'Esta fila todavía no tiene secciones con alumnos.';
  }
  return null;
}

/** Nombre de la acción. Uno solo, y se dice igual en todas las filas. */
export const ETIQUETA_CARGAR = 'Asignar a estudiantes';

/**
 * La colegiatura que el alumno ya tiene en su plan, si lo que se va a asignar
 * es OTRA. `null` si no hay choque.
 *
 * La fila de una colegiatura por generación cubre el servicio entero, así que
 * su lista trae también a los alumnos de las otras generaciones. Asignarla a
 * todos les pone dos colegiaturas al mes, y además crea en el acto las de los
 * meses ya pasados. Por eso a esos alumnos no se les marca solos y se dice
 * cuál tienen. No se prohíbe: en algunos colegios la sala de tareas o la
 * guardería también son colegiaturas, y conviven con la principal.
 */
export function otraColegiatura(
  nuevo: { id: number; tipo: string },
  delAlumno: readonly { id: number; tipo: string; nombre: string }[],
): string | null {
  if (nuevo.tipo !== 'mensualidad') return null;
  return delAlumno.find((c) => c.tipo === 'mensualidad' && c.id !== nuevo.id)?.nombre ?? null;
}

/**
 * Cuántas cuotas del calendario ya tienen su fecha de emisión alcanzada. Esas
 * se convierten en cargo al confirmar, no el día de su fecha; hay que decirlo
 * antes de que la persona pulse. Es un máximo: al alumno que se inscribió
 * después de una cuota, esa no se le cobra.
 */
export function cuotasYaEmitidas(
  cuotas: readonly { fechaEmision: string | null }[],
  hoy: string,
): number {
  return cuotas.filter((c) => c.fechaEmision != null && c.fechaEmision <= hoy).length;
}
