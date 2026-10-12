/**
 * Envío de un SMS: la única puerta que debería usar el resto de la app.
 *
 * Todo lo que puede salir mal y no cuesta dinero se verifica antes de llamar a
 * AWS — el interruptor de la empresa, el texto, el teléfono. Cuando llegamos a
 * `publicarSms` ya no hay vuelta atrás: eso se factura.
 */

import { motivoDeshabilitado, maxPartes, type MotivoSmsDeshabilitado } from './config';
import { publicarSms, SmsApiError } from './client';
import { normalizarTelefono } from './telefono';
import { analizarSms, type CodificacionSms } from './mensaje';

/** El campo `telefono` del tutor no se puede convertir a E.164 con certeza. */
export class SmsTelefonoInvalidoError extends Error {
  telefonoOriginal: string;
  constructor(telefonoOriginal: string) {
    super(`Teléfono no utilizable para SMS: ${JSON.stringify(telefonoOriginal)}`);
    this.name = 'SmsTelefonoInvalidoError';
    this.telefonoOriginal = telefonoOriginal;
  }
}

/** La empresa no está en la allowlist, o no hay credenciales de SNS. */
export class SmsDeshabilitadoError extends Error {
  teamId: number;
  motivo: MotivoSmsDeshabilitado;
  constructor(teamId: number, motivo: MotivoSmsDeshabilitado) {
    super(
      motivo === 'sin-credenciales'
        ? 'El envío de SMS no está configurado (faltan SMS_SNS_KEY_ID / SMS_SNS_SECRET).'
        : `La empresa ${teamId} no está autorizada a enviar SMS (SMS_TEAMS_HABILITADOS).`,
    );
    this.name = 'SmsDeshabilitadoError';
    this.teamId = teamId;
    this.motivo = motivo;
  }
}

/** No hay nada que mandar. Un SMS en blanco se cobra igual que uno con texto. */
export class SmsTextoVacioError extends Error {
  constructor() {
    super('El mensaje está vacío.');
    this.name = 'SmsTextoVacioError';
  }
}

/** El texto saldría en más partes de las permitidas. Se rechaza, no se corta. */
export class SmsTextoLargoError extends Error {
  partes: number;
  maximo: number;
  constructor(partes: number, maximo: number) {
    super(`El mensaje saldría en ${partes} partes y el máximo es ${maximo}. Acórtalo antes de enviarlo.`);
    this.name = 'SmsTextoLargoError';
    this.partes = partes;
    this.maximo = maximo;
  }
}

/** SNS rechazó el envío. `codigo` es el nombre de la excepción de AWS. */
export class SmsEnvioError extends Error {
  codigo: string;
  status: number;
  constructor(codigo: string, status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SmsEnvioError';
    this.codigo = codigo;
    this.status = status;
  }
}

export interface ResultadoEnvioSms {
  messageId: string;
  /** El E.164 que realmente se usó, no el que venía en la ficha. */
  telefono: string;
  /** Partes facturadas. El llamador debería registrarlo: es el costo real. */
  partes: number;
  codificacion: CodificacionSms;
}

/**
 * Manda un SMS y devuelve con qué costo salió.
 *
 * El orden de las validaciones es deliberado: primero el interruptor de la
 * empresa (si está apagado no tiene sentido reportar teléfonos malos), después
 * el texto, y de último el teléfono, que es el error que un humano va a tener
 * que ir a corregir en la ficha del tutor.
 *
 * Lanza `SmsDeshabilitadoError`, `SmsTextoVacioError`, `SmsTextoLargoError`,
 * `SmsTelefonoInvalidoError` o `SmsEnvioError`. Nunca devuelve a medias.
 */
export async function enviarSms(
  teamId: number,
  telefono: string | null | undefined,
  texto: string,
): Promise<ResultadoEnvioSms> {
  const motivo = await motivoDeshabilitado(teamId);
  if (motivo) throw new SmsDeshabilitadoError(teamId, motivo);

  const cuerpo = texto?.trim() ?? '';
  if (!cuerpo) throw new SmsTextoVacioError();

  const conteo = analizarSms(cuerpo);
  const tope = maxPartes();
  if (conteo.partes > tope) throw new SmsTextoLargoError(conteo.partes, tope);

  const e164 = normalizarTelefono(telefono);
  if (!e164) throw new SmsTelefonoInvalidoError(telefono ?? '');

  try {
    const { messageId } = await publicarSms(e164, cuerpo);
    return { messageId, telefono: e164, partes: conteo.partes, codificacion: conteo.codificacion };
  } catch (err) {
    if (err instanceof SmsApiError) {
      throw new SmsEnvioError(err.codigo, err.status, err.message, { cause: err });
    }
    throw err;
  }
}
