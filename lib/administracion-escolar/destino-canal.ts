/**
 * A qué número o correo de un contacto va cada canal de aviso.
 *
 * Una sola definición para el motor que manda los avisos y para las pantallas
 * que enseñan por dónde se le puede escribir a alguien. Estaba copiada en
 * cuatro sitios, y bastaba que uno se moviera para que la ficha prometiera un
 * canal por el que después no salía nada.
 *
 * EL WHATSAPP SALE SOLO AL CAMPO «WHATSAPP». Antes, si estaba vacío, se usaba
 * el celular. Eso hacía imposible decir «a esta persona no le escribas por
 * WhatsApp»: quien borraba el número guardaba —se guardaba de verdad—, y la
 * ficha seguía diciendo «WhatsApp: (809)…» con el celular, así que parecía que
 * el cambio no se había hecho. Ahora cada campo manda en su canal: sin número
 * en WhatsApp, no hay WhatsApp.
 *
 * El SMS sí conserva su alternativa (celular, y si no, el número de WhatsApp):
 * los dos son móviles. El fijo de la casa no recibe nada y nunca se usa.
 *
 * Sin `server-only` y sin imports: lo usan componentes de cliente.
 */

export type CanalDeContacto = 'correo' | 'whatsapp' | 'sms';

export interface ContactoConCanales {
  email?: string | null;
  whatsapp?: string | null;
  celular?: string | null;
}

export function destinoDeContacto(c: ContactoConCanales, canal: CanalDeContacto): string | null {
  if (canal === 'correo') return c.email?.trim() || null;
  if (canal === 'whatsapp') return c.whatsapp?.trim() || null;
  return c.celular?.trim() || c.whatsapp?.trim() || null;
}
