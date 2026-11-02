/**
 * Cómo se dice en pantalla cada cosa de un aviso a las familias: qué aviso fue
 * y si llegó. Lo comparten el panel de «Avisos» y su export, y no importa nada
 * del servidor.
 */

/** Cómo se llama cada aviso en cristiano. */
export const AVISO_TEXTO: Record<string, string> = {
  'al-emitir': 'Factura nueva',
  'al-vencer': 'Venció hoy',
  'antes-mora': 'Antes del recargo',
  // Los del expediente: no son cobros.
  documentos: 'Enlace de documentos',
  formulario: 'Formulario',
};

export const CANAL_TEXTO: Record<string, string> = {
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

/**
 * Lo que se sabe de si el aviso llegó. Solo WhatsApp devuelve acuse (Meta dice
 * entregado y leído); el correo y el SMS salen sin él, y eso es «Sin acuse», no
 * «falló»: no saberlo no es lo mismo que haber fallado.
 */
export type Entrega = 'leido' | 'entregado' | 'enviado' | 'fallido' | 'sin-acuse';

export const ENTREGA_TEXTO: Record<Entrega, string> = {
  leido: 'Leído',
  entregado: 'Entregado',
  enviado: 'Enviado',
  fallido: 'Falló',
  'sin-acuse': 'Sin acuse',
};

/** El `estado_entrega` guardado, leído como `Entrega`. */
export function entregaDe(estado: string | null | undefined): Entrega {
  return estado === 'leido' || estado === 'entregado' || estado === 'enviado' || estado === 'fallido'
    ? estado : 'sin-acuse';
}

/**
 * Cuántos MENSAJES fueron, no cuántas filas: varios cobros de una familia que
 * viajaron juntos comparten `grupo` (ver `adminEscolarAvisosEnviados.grupo`).
 */
export function contarMensajes(filas: { id: number; grupo: string | null }[]): number {
  return new Set(filas.map((f) => f.grupo ?? `#${f.id}`)).size;
}
