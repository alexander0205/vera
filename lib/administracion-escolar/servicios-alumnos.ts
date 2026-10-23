/**
 * «Servicios por alumno»: qué conceptos cobra cada matrícula, en una cuadrícula
 * de alumnos × conceptos, para cambiarlos por lote.
 *
 * Al matricular se elige el plan de cada niño, pero después llegan los cambios
 * por grupos: este mes se apuntan doce al almuerzo, Maternal pasa a horario
 * extendido, los de registro SIGERD no llevan mensualidad. Hacerlo matrícula
 * por matrícula en «Editar matrícula» era abrir y guardar setenta fichas.
 *
 * La regla de lo que se guarda vive aquí, sin base de datos, para probarla.
 */

/** Lo que se le pide cambiar a una matrícula. */
export interface CambioDeConceptos {
  matriculaId: number;
  agregar: number[];
  quitar: number[];
}

/**
 * La lista nueva de conceptos de una matrícula. Quitar gana a agregar si
 * vinieran los dos con el mismo concepto (no debería pasar: la pantalla no lo
 * permite), y el orden se conserva para no mover la colegiatura del primer
 * lugar, que es donde la busca la ficha.
 */
export function conceptosTrasCambio(actuales: number[], cambio: Pick<CambioDeConceptos, 'agregar' | 'quitar'>): number[] {
  const quitar = new Set(cambio.quitar);
  const quedan = actuales.filter((id) => !quitar.has(id));
  for (const id of cambio.agregar) if (!quitar.has(id) && !quedan.includes(id)) quedan.push(id);
  return quedan;
}

/**
 * Normaliza lo que manda la pantalla: ids enteros, sin repetidos, sin cambios
 * vacíos y como mucho `tope` matrículas por envío. Devuelve el error para la
 * persona si algo no cuadra.
 */
export function validarCambios(entrada: unknown, tope = 500): { ok: true; cambios: CambioDeConceptos[] } | { ok: false; error: string } {
  if (!Array.isArray(entrada)) return { ok: false, error: 'No llegó ningún cambio.' };
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);
  const cambios: CambioDeConceptos[] = [];
  for (const c of entrada as Record<string, unknown>[]) {
    const matriculaId = Number(c?.matriculaId);
    if (!Number.isInteger(matriculaId) || matriculaId <= 0) return { ok: false, error: 'Hay un cambio sin matrícula.' };
    const agregar = ids(c.agregar);
    const quitar = ids(c.quitar);
    if (agregar.length + quitar.length > 0) cambios.push({ matriculaId, agregar, quitar });
  }
  if (cambios.length === 0) return { ok: false, error: 'No hay cambios que guardar.' };
  if (cambios.length > tope) return { ok: false, error: `Son ${cambios.length} alumnos: guarda como mucho ${tope} de una vez.` };
  return { ok: true, cambios };
}

/**
 * Qué cambia en una matrícula para que quede justo con los conceptos de un
 * paquete, entre los que su sección cobra. Lo que el paquete pide y no tiene
 * tarifa en su sección no se agrega: no habría con qué cobrarlo.
 */
export function cambioParaPaquete(
  actuales: number[],
  delPaquete: number[],
  conTarifa: number[],
): Pick<CambioDeConceptos, 'agregar' | 'quitar'> {
  const quiere = new Set(delPaquete.filter((id) => conTarifa.includes(id)));
  return {
    agregar: [...quiere].filter((id) => !actuales.includes(id)),
    quitar: actuales.filter((id) => !quiere.has(id)),
  };
}

/** Lo que cuenta como «sí» en una casilla de la hoja: X, x, sí, si, 1, ✓. */
export const marcaDeHoja = (v: unknown): boolean =>
  /^(x|s[ií]|1|✓|✔|true)$/i.test(String(v ?? '').trim());

/** Encabezados fijos de la hoja de carga, antes de las columnas de conceptos. */
export const COLUMNAS_FIJAS = ['ID matrícula', 'Código', 'Alumno', 'Grado', 'Sección'] as const;

/**
 * De la hoja de carga (la que se descarga de «Servicios por alumno» y completa
 * el colegio) a los cambios que pide, comparando con lo que tiene cada alumno.
 * La fila se reconoce por «ID matrícula»; si lo borraron, por el nombre exacto.
 * Una columna se reconoce por el nombre del concepto. Lo que no cuadra no se
 * adivina: se devuelve como aviso para que lo vean.
 */
export function cambiosDesdeHoja(
  hoja: { encabezados: string[]; filas: unknown[][] },
  alumnos: { matriculaId: number; nombre: string; conceptosIds: number[]; conTarifa: number[] }[],
  conceptos: { id: number; nombre: string }[],
): { cambios: CambioDeConceptos[]; avisos: string[] } {
  const norm = (s: unknown) => String(s ?? '').trim().toLocaleLowerCase('es').replace(/\s+/g, ' ');
  const col = (nombre: string) => hoja.encabezados.findIndex((h) => norm(h) === norm(nombre));
  const iId = col('ID matrícula');
  const iAlumno = col('Alumno');
  const columnas = conceptos.map((c) => ({ c, i: col(c.nombre) })).filter((x) => x.i >= 0);
  const avisos: string[] = [];
  if (columnas.length === 0) return { cambios: [], avisos: ['La hoja no tiene ninguna columna con el nombre de un concepto.'] };

  const porId = new Map(alumnos.map((a) => [a.matriculaId, a]));
  const porNombre = new Map<string, typeof alumnos>();
  for (const a of alumnos) porNombre.set(norm(a.nombre), [...(porNombre.get(norm(a.nombre)) ?? []), a]);

  const cambios: CambioDeConceptos[] = [];
  hoja.filas.forEach((fila, n) => {
    const id = iId >= 0 ? Number(fila[iId]) : NaN;
    let alumno = Number.isInteger(id) ? porId.get(id) : undefined;
    if (!alumno && iAlumno >= 0 && String(fila[iAlumno] ?? '').trim()) {
      const candidatos = porNombre.get(norm(fila[iAlumno])) ?? [];
      if (candidatos.length === 1) alumno = candidatos[0];
      else {
        avisos.push(`Fila ${n + 2}: «${String(fila[iAlumno]).trim()}» ${candidatos.length ? 'aparece más de una vez' : 'no está matriculado'}; no se tocó.`);
        return;
      }
    }
    if (!alumno) return;
    const agregar: number[] = [];
    const quitar: number[] = [];
    for (const { c, i } of columnas) {
      const quiere = marcaDeHoja(fila[i]);
      const tiene = alumno.conceptosIds.includes(c.id);
      if (quiere && !tiene) {
        if (alumno.conTarifa.includes(c.id)) agregar.push(c.id);
        else avisos.push(`${alumno.nombre}: «${c.nombre}» no tiene precio en su sección; no se agregó.`);
      }
      if (!quiere && tiene) quitar.push(c.id);
    }
    if (agregar.length + quitar.length > 0) cambios.push({ matriculaId: alumno.matriculaId, agregar, quitar });
  });
  return { cambios, avisos };
}
