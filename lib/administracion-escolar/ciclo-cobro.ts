import { DIA_EMISION_MAX, esFrecuencia } from './calendario';

/**
 * Normaliza el ciclo de cobro y los avisos que llegan del cliente.
 *
 * Se valida aquí y no solo en la pantalla porque estos números terminan en un
 * plan de factura recurrente que emite documentos fiscales solo: un día de
 * emisión de 45 haría cobrar en fechas imposibles.
 */

/**
 * Los tres momentos en que se le escribe al tutor, en orden.
 *
 * Se nombran por lo que le pasa a la FACTURA, no por lo que hace el colegio:
 *
 *   se emite  →  vence  →  (días de gracia)  →  entra el recargo
 *
 * El tercero cuelga de la MORA y no del vencimiento. Mientras las dos fechas
 * eran la misma daba igual; con días de gracia de por medio, anclarlo al
 * vencimiento haría que subir la gracia moviera el aviso sin que nadie lo
 * pidiera —y encima lo dejaría avisando de algo que aún no va a pasar—.
 *
 * Hubo un cuarto, "se acerca tu pago", días ANTES de emitir. Se quitó porque
 * avisaba de una factura que todavía no existe: sin monto, sin documento y sin
 * dónde pagar, el padre no podía hacer nada con él.
 */
export type Aviso = 'al-emitir' | 'al-vencer' | 'antes-mora';

export type Canal = 'correo' | 'whatsapp' | 'sms';

/**
 * Por qué canal sale cada aviso. Fijo en código, no configurable.
 *
 * - El correo llega a los tres porque no cuesta nada y queda como constancia.
 * - WhatsApp va a los tres, siempre por plantilla aprobada.
 * - El SMS se paga por mensaje. Sale siempre en `antes-mora`, el que le ahorra
 *   el recargo al padre. En los demás entra únicamente si el WhatsApp no se
 *   puede mandar (ver `AVISOS_CON_SMS_DE_RESPALDO`).
 *
 * Dejarlo elegir sería dejar al colegio configurar un cobro que no sale.
 */
export const CANALES_DEL_AVISO: Record<Aviso, readonly Canal[]> = {
  'al-emitir':  ['correo', 'whatsapp'],
  'al-vencer':  ['correo', 'whatsapp'],
  'antes-mora': ['correo', 'whatsapp', 'sms'],
};

/**
 * Los avisos que, si el WhatsApp no se puede mandar, salen por SMS (regla del
 * negocio, 31-10-2026: solo `antes-mora` va por los tres a la vez; mandar los dos
 * en los demás era pagar dos veces por el mismo recado). «No se puede» es
 * cualquiera de estos: WhatsApp apagado, la familia sin número, la cuota agotada,
 * el envío rechazado o Meta diciendo después que no llegó.
 */
export const AVISOS_CON_SMS_DE_RESPALDO: readonly Aviso[] = ['al-emitir', 'al-vencer'];

export function camposCiclo(body: Record<string, unknown>) {
  const entero = (v: unknown, min: number, max: number): number | null => {
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const set: Record<string, unknown> = {};
  if (body.frecuencia !== undefined && esFrecuencia(body.frecuencia)) set.frecuencia = body.frecuencia;
  // El 31 no se admite: en los meses de 30 días habría que decidir si se
  // adelanta o se atrasa, y el colegio no puede predecir la respuesta.
  if (body.diaEmision !== undefined)      set.diaEmision = entero(body.diaEmision, 1, DIA_EMISION_MAX);
  if (body.diasParaPago !== undefined)    set.diasParaPago = entero(body.diasParaPago, 0, 90);
  if (body.avisoDiaEmision !== undefined) set.avisoDiaEmision = Boolean(body.avisoDiaEmision);
  // Mínimo 1: con 0 el aviso "antes del recargo" caería el mismo día que el
  // recargo, y avisar de algo que ya pasó no es avisar. El tope de arriba lo
  // ponen los días de gracia y se comprueba en la pantalla, que es la única que
  // los tiene delante.
  if (body.avisoAntesMoraDias !== undefined) set.avisoAntesMoraDias = entero(body.avisoAntesMoraDias, 1, 60);
  if (body.avisoDiaVencimiento !== undefined) set.avisoDiaVencimiento = Boolean(body.avisoDiaVencimiento);
  // Días entre que vence y entra el recargo. 0 es válido y significa lo de
  // antes: el recargo cae el mismo día del vencimiento.
  if (body.moraDiasGracia !== undefined) set.moraDiasGracia = entero(body.moraDiasGracia, 0, 60) ?? 0;
  if (body.avisosActivos !== undefined)  set.avisosActivos = Boolean(body.avisosActivos);
  if (body.avisoCorreo !== undefined)   set.avisoCorreo = Boolean(body.avisoCorreo);
  if (body.avisoWhatsapp !== undefined) set.avisoWhatsapp = Boolean(body.avisoWhatsapp);
  if (body.avisoSms !== undefined)      set.avisoSms = Boolean(body.avisoSms);
  if (body.admiteBeca !== undefined)       set.admiteBeca = Boolean(body.admiteBeca);
  if (body.cobraMora !== undefined)        set.cobraMora = Boolean(body.cobraMora);
  // 0% no es un descuento, es la ausencia de uno: se guarda como nulo para que
  // "no se ofrece" tenga una sola representación.
  if (body.descuentoAdelantoPct !== undefined) {
    const pct = entero(body.descuentoAdelantoPct, 1, 100);
    set.descuentoAdelantoPct = pct;
  }
  return set;
}
