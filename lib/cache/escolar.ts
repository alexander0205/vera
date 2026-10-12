import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';

/**
 * Caché de lo que se repite en el módulo escolar.
 *
 * La estructura de un colegio —años escolares, servicios, grados, secciones,
 * conceptos y sus tarifas— se define al empezar el curso y no se vuelve a
 * tocar. Pero se lee en cada carga de Cargos, de Matrículas y de la ficha de
 * cada estudiante, así que se estaba pidiendo a la base decenas de veces al día
 * para devolver siempre lo mismo.
 *
 * Se cachea por etiquetas y no por tiempo, porque el tiempo obliga a elegir
 * entre datos viejos o caché inútil: con etiquetas, quien cambia la estructura
 * la invalida y el resto del día se sirve de memoria.
 */

/** Estructura académica: períodos, servicios, grados, secciones, materias. */
export const tagEstructura = (teamId: number) => `escolar:estructura:${teamId}`;
/** Conceptos de pago y sus tarifas por año. */
export const tagTarifas = (teamId: number) => `escolar:tarifas:${teamId}`;
/** Todo lo derivado del snapshot de Sigerd. */
export const tagSigerd = (teamId: number) => `escolar:sigerd:${teamId}`;

/**
 * Envuelve una lectura para que se sirva de caché hasta que alguien invalide su
 * etiqueta. El `keyParts` tiene que incluir el team: sin él, dos colegios
 * compartirían la misma entrada.
 */
export function cachearPorTag<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  tags: string[],
  /** Tope de seguridad por si algún camino olvida invalidar. */
  revalidateSegundos = 3600,
) {
  return unstable_cache(fn, keyParts, { tags, revalidate: revalidateSegundos });
}

/**
 * Esta versión de Next pide un segundo argumento con el perfil de caché. Se
 * envuelve para no repetir el casteo en cada llamada, igual que ya hace
 * `lib/dgii/catalogos.ts`, y para que un fallo al invalidar no tumbe la
 * escritura que acaba de guardarse bien.
 */
function invalidar(tag: string): void {
  try {
    (revalidateTag as (tag: string, scope?: string) => void)(tag, 'max');
  } catch (err) {
    console.warn('[cache.escolar] no se pudo invalidar', tag, err instanceof Error ? err.message : err);
  }
}

/**
 * A llamar desde cualquier alta, cambio o baja de estructura. Es barato
 * equivocarse invalidando de más y caro quedarse corto: una tarifa vieja en
 * caché cobra de menos.
 */
export function invalidarEstructura(teamId: number): void {
  invalidar(tagEstructura(teamId));
  // Las tarifas cuelgan de la estructura: si desaparece un grado, sus precios
  // dejan de tener sentido.
  invalidar(tagTarifas(teamId));
}

export function invalidarTarifas(teamId: number): void {
  invalidar(tagTarifas(teamId));
}

/** Tras bajar datos nuevos de Sigerd. */
export function invalidarSigerd(teamId: number): void {
  invalidar(tagSigerd(teamId));
  invalidar(tagEstructura(teamId));
}
