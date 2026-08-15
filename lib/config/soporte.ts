/**
 * Por dónde se nos habla.
 *
 * El correo va escrito aquí porque es el que ya usa el resto del sistema y no
 * cambia. El WhatsApp sale del entorno y NO tiene valor por defecto a
 * propósito: un número inventado en una pantalla que dice «escríbenos» es peor
 * que no ofrecer WhatsApp, porque el cliente escribe, no le contesta nadie, y
 * concluye que no atendemos.
 *
 * Sin la variable puesta, las pantallas enseñan solo el correo.
 */

export const SOPORTE = {
  correo: 'soporte@zero.com.do',
  /** Solo dígitos con código de país, ej. «18095551234». */
  whatsapp: process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP?.replace(/\D/g, '') || null,
} as const;

/** Enlace de WhatsApp con el mensaje ya escrito, o null si no hay número. */
export function enlaceWhatsapp(mensaje: string): string | null {
  if (!SOPORTE.whatsapp) return null;
  return `https://wa.me/${SOPORTE.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

/** `mailto:` con asunto y cuerpo ya puestos. */
export function enlaceCorreo(asunto: string, cuerpo?: string): string {
  const params = new URLSearchParams({ subject: asunto });
  if (cuerpo) params.set('body', cuerpo);
  return `mailto:${SOPORTE.correo}?${params.toString()}`;
}
