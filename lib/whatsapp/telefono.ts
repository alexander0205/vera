/**
 * Números de teléfono en el formato que quiere WhatsApp.
 *
 * Hace falta porque en la base conviven tres formatos del MISMO número —
 * `(809) 590-6713`, `829-641-2333`, `8297530542`— y el CRM los trata como
 * contactos distintos: al mandar a `8293596602` abrió una conversación nueva
 * aunque ya existía una con `18293596602`. Dos hilos del mismo padre significan
 * que el colegio contesta en uno y el padre escribió en el otro.
 *
 * República Dominicana y Estados Unidos comparten el plan de numeración (NANP),
 * así que diez dígitos siempre llevan el 1 delante.
 */

/** El número listo para el CRM: solo dígitos, con código de país. */
export function aE164(crudo: string | null | undefined): string | null {
  if (!crudo) return null;

  const digitos = crudo.replace(/\D/g, '');
  if (digitos.length === 0) return null;

  // 10 dígitos = NANP sin código de país (809/829/849 en RD).
  if (digitos.length === 10) return `1${digitos}`;

  // 11 empezando en 1 = ya viene completo.
  if (digitos.length === 11 && digitos.startsWith('1')) return digitos;

  // Internacional: entre 11 y 15 dígitos es un E.164 plausible de otro país.
  // Se deja pasar porque un colegio puede tener un padre en el extranjero, y
  // rechazarlo sería peor que intentarlo.
  if (digitos.length >= 11 && digitos.length <= 15) return digitos;

  // Todo lo demás —una extensión, un fijo a medias, un dedo de más— no es un
  // número al que se le pueda escribir. Devolver algo parecido haría que el
  // mensaje saliera hacia un desconocido.
  return null;
}

/** Para el botón `wa.me/…`, que quiere exactamente lo mismo. */
export const aWaMe = aE164;
