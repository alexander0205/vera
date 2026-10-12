/**
 * Si se pueden mandar SMS, y con qué tope de tamaño.
 *
 * A diferencia de WhatsApp (`lib/whatsapp/config.ts`), aquí no hay nada que
 * enlazar por empresa: la cuenta de SNS es una sola, de la plataforma. Lo único
 * que decide si un SMS sale es que las credenciales estén puestas.
 *
 * Quién manda y quién no se decide en el concepto, con `aviso_sms`: el colegio
 * enciende el canal en su pantalla de Avisos y a partir de ahí sus
 * recordatorios salen también por SMS. No hay una segunda lista aquí — sería
 * una puerta más que abrir para el mismo permiso, y de las que se olvidan.
 *
 * Es `async` aunque hoy no toque la base: el día que esto dependa de una
 * columna, cambia este archivo y ningún llamador.
 */

import 'server-only';
import { snsConfigurado } from './client';

/**
 * Por qué NO se puede mandar, o `null` si sí se puede.
 *
 * Devuelve el motivo y no un booleano porque la pantalla necesita explicarlo:
 * "no disponible" a secas deja al colegio sin saber si esperar o llamar.
 */
export type MotivoSmsDeshabilitado = 'sin-credenciales';

export async function motivoDeshabilitado(_teamId: number): Promise<MotivoSmsDeshabilitado | null> {
  return snsConfigurado() ? null : 'sin-credenciales';
}

/** ¿Se puede mandar SMS ahora mismo? */
export async function smsHabilitado(teamId: number): Promise<boolean> {
  return (await motivoDeshabilitado(teamId)) === null;
}

/**
 * Tope de partes por mensaje. No es un límite de SNS sino un freno de gasto:
 * un aviso de cobro cabe de sobra en 1 o 2 partes, así que 4 solo se alcanza si
 * alguien armó mal el texto (una factura entera concatenada, por ejemplo) — y
 * eso, multiplicado por todos los padres del colegio, es dinero de verdad.
 */
export function maxPartes(): number {
  const n = Number(process.env.SMS_MAX_PARTES);
  return Number.isInteger(n) && n > 0 ? n : 4;
}
