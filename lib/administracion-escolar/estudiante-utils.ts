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
