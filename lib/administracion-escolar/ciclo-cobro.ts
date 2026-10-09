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
 * - El SMS se reserva para los dos que tienen dinero detrás: el que le ahorra
 *   el recargo al padre y el que le dice que ya lo tiene. Se paga por mensaje,
 *   y son los únicos que justifican el gasto.
 * - WhatsApp va también a los tres. Antes solo al primero, y el motivo era
 *   real: la API únicamente deja escribir dentro de las 24 horas siguientes a
 *   la última respuesta del tutor, así que fuera de esa ventana devuelve 422 y
 *   el mensaje no sale. No hay plantillas —`enviarMensaje` manda `{to, text}`
 *   y nada más—, así que eso no se puede sortear.
 *
 *   Pero ese razonamiento se equivocaba de conclusión: trataba a WhatsApp como
 *   si fuera el ÚNICO portador del aviso, y en `al-vencer` y `antes-mora` el
 *   SMS ya va y siempre llega. El WhatsApp ahí no sustituye a nadie, se suma —
 *   y cuando el tutor escribió hace poco, que es lo normal en un colegio con
 *   grupo activo, llega por el canal que de verdad lee.
 *
 *   Un intento fuera de ventana no cuesta nada: el envío que revienta libera
 *   su reserva y NO descuenta del tope («solo se descuenta lo que de verdad
 *   salió», más abajo en avisos.ts). Lo peor que pasa es una línea de error en
 *   el historial junto a un SMS entregado.
 *
 * Dejarlo elegir sería dejar al colegio configurar un cobro que no sale.
 */
export const CANALES_DEL_AVISO: Record<Aviso, readonly Canal[]> = {
  'al-emitir':  ['correo', 'whatsapp'],
  'al-vencer':  ['correo', 'whatsapp', 'sms'],
  'antes-mora': ['correo', 'whatsapp', 'sms'],
};

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
