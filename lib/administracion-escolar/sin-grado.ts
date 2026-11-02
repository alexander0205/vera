/**
 * Los alumnos que no van a ningún grado del colegio: los de otros centros que
 * vienen a reforzamiento o a inglés, o quien solo usa el transporte.
 *
 * Toda matrícula cuelga de una sección, y de ahí salen el precio, los reportes y
 * los cobros. Quitar ese requisito haría desaparecer a estos alumnos de todo lo
 * que cuenta por grado, así que se hace al revés: el sistema les crea el grado
 * «Sin grado» con su sección, y a quien matricula no le pide ninguno de los dos.
 *
 * Aquí solo los nombres, sin base de datos: los usa también la pantalla.
 */

export const NOMBRE_SIN_GRADO = 'Sin grado';
export const NOMBRE_SECCION_SIN_GRADO = 'Sin sección';

/** ¿Es el grado que crea el sistema? Se reconoce por el nombre: no hay otra marca. */
export function esGradoSinGrado(nombre: string | null | undefined): boolean {
  return nombre?.trim().toLowerCase() === NOMBRE_SIN_GRADO.toLowerCase();
}

/**
 * El curso escrito como se dice: «Kinder A», y solo «Sin grado» para quien no
 * tiene ninguno, que si no se leería «Sin grado Sin sección».
 */
export function textoDeCurso(grado: string | null | undefined, seccion: string | null | undefined, separador = ' '): string {
  if (esGradoSinGrado(grado)) return grado!.trim();
  return [grado, seccion].filter(Boolean).join(separador);
}
