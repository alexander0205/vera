/**
 * Utilidades del estudiante compartidas cliente/servidor (sin `server-only`).
 * La edad se DERIVA de la fecha de nacimiento — no se guarda para no quedar
 * stale cada año. El sexo es un catálogo cerrado.
 */

export const SEXOS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'otro', label: 'Otro' },
] as const;

export type Sexo = (typeof SEXOS)[number]['value'];

export const SEXOS_VALIDOS: readonly string[] = SEXOS.map((s) => s.value);

/**
 * Situación del alumno en el colegio. Solo se elige al EDITAR: al dar de alta
 * siempre entra 'activo' —nadie inscribe a alguien ya retirado— y ofrecerlo en
 * el alta invitaría a crear fichas nacidas muertas.
 */
export const ESTADOS_ESTUDIANTE = [
  { value: 'activo',   label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'graduado', label: 'Graduado' },
] as const;

export function labelSexo(sexo: string | null | undefined): string {
  return SEXOS.find((s) => s.value === sexo)?.label ?? '—';
}

/** Edad en años cumplidos a partir de la fecha de nacimiento (YYYY-MM-DD). */
export function calcularEdad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

/**
 * El código que se le enseña al usuario bajo el nombre del alumno.
 *
 * El `codigo` interno (matrícula/expediente) lo ponen a mano o lo genera el
 * alta; los alumnos que llegan de SIGERD no lo traen, y la lista enseñaba «—»
 * aunque tuvieran RNE o, al menos, un id del portal. Se cae en cascada a lo
 * mejor que haya: código → RNE → «SIGERD <id>». `null` solo si no hay nada.
 */
export function codigoVisible(e: {
  codigo?: string | null;
  codigoRne?: string | null;
  sigerdId?: number | null;
}): string | null {
  const codigo = e.codigo?.trim();
  if (codigo) return codigo;
  const rne = e.codigoRne?.trim();
  if (rne) return rne;
  return e.sigerdId != null ? `SIGERD ${e.sigerdId}` : null;
}
