/**
 * Cliente de AWS SNS para SMS salientes.
 *
 * Credenciales por variables de entorno propias de la feature
 * (`SMS_SNS_*`), no por un perfil global de AWS ni por el rol de la instancia
 * — mismo criterio que `lib/storage/comprobantes.ts`. Así el usuario IAM que
 * manda SMS puede tener una sola política (`sns:Publish`) y si se filtra no
 * alcanza al bucket de comprobantes ni a nada más.
 *
 * Dos cosas de SNS que hay que tener claras antes de tocar esto:
 *
 * 1. **`Publish` que devuelve MessageId no significa "entregado".** SNS acepta
 *    el mensaje y lo entrega de forma asíncrona; un número apagado, inexistente
 *    o bloqueado por la operadora falla *después*, sin excepción que atrapar.
 *    Para ver eso hay que habilitar delivery status logging a CloudWatch. O sea:
 *    un `ok` de aquí no es prueba de que el padre recibió el aviso.
 * 2. **Cobra igual.** Un envío a un número mal armado se paga completo. Por eso
 *    el teléfono se normaliza (y se descarta si hay duda) *antes* de llegar acá.
 */

import 'server-only';
import { SNSClient, PublishCommand, type PublishCommandInput } from '@aws-sdk/client-sns';

/** Config leída en cada llamada, no al importar: mantiene el módulo testeable. */
function leerConfig() {
  return {
    // Ojo: no toda región de AWS entrega SMS. us-east-1 es la que se usa por
    // defecto y la que cubre destinos +1.
    region: process.env.SMS_SNS_REGION ?? 'us-east-1',
    keyId: process.env.SMS_SNS_KEY_ID,
    secret: process.env.SMS_SNS_SECRET,
    senderId: process.env.SMS_SENDER_ID,
  };
}

/** ¿Hay credenciales de SNS? Sin esto no se manda nada (dev local, previews). */
export function snsConfigurado(): boolean {
  const { keyId, secret } = leerConfig();
  return Boolean(keyId && secret);
}

export class SmsApiError extends Error {
  /** Nombre de la excepción de SNS: `InvalidParameterException`, `Throttled`… */
  codigo: string;
  /** httpStatusCode de la respuesta; 0 si ni siquiera hubo respuesta (red, DNS). */
  status: number;
  constructor(codigo: string, status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SmsApiError';
    this.codigo = codigo;
    this.status = status;
  }
}

let cliente: SNSClient | null = null;
function getCliente(): SNSClient {
  if (!cliente) {
    const { region, keyId, secret } = leerConfig();
    if (!keyId || !secret) throw new SmsApiError('SinCredenciales', 0, 'SNS de SMS no configurado');
    cliente = new SNSClient({ region, credentials: { accessKeyId: keyId, secretAccessKey: secret } });
  }
  return cliente;
}

/**
 * Arma el payload de `Publish` sin mandar nada. Está exportado justamente para
 * poder verificar en pruebas qué se enviaría, sin gastar un SMS.
 */
export function construirPublishInput(telefonoE164: string, texto: string): PublishCommandInput {
  const { senderId } = leerConfig();
  const input: PublishCommandInput = {
    PhoneNumber: telefonoE164,
    Message: texto,
    MessageAttributes: {
      // Transactional, nunca Promotional: un aviso de cobro no es publicidad.
      // SNS le da prioridad de entrega y no le aplica las restricciones de
      // marketing (horarios, opt-out promocional). Cuesta un poco más por
      // mensaje, y esa es la decisión consciente.
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
    },
  };
  if (senderId) {
    // Solo tiene efecto donde la operadora lo soporta. En destinos +1 (RD, EE.UU.,
    // Canadá) AWS lo ignora y el mensaje sale desde un número corto suyo, así que
    // esta variable es para cuando se mande a otros países.
    input.MessageAttributes!['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: senderId };
  }
  return input;
}

export interface PublicarSmsResult {
  /** Id que asigna SNS al aceptar el mensaje. Sirve para cruzar con CloudWatch. */
  messageId: string;
}

/** Publica un SMS. `telefonoE164` tiene que venir ya normalizado (`+18095551234`). */
export async function publicarSms(telefonoE164: string, texto: string): Promise<PublicarSmsResult> {
  try {
    const res = await getCliente().send(new PublishCommand(construirPublishInput(telefonoE164, texto)));
    if (!res.MessageId) throw new SmsApiError('SinMessageId', 0, 'SNS aceptó el envío pero no devolvió MessageId');
    return { messageId: res.MessageId };
  } catch (err) {
    if (err instanceof SmsApiError) throw err;
    // Las excepciones del SDK v3 traen `name` con el código de servicio y
    // `$metadata.httpStatusCode`. Se aplanan a un solo tipo para que el
    // llamador no tenga que conocer el catálogo de errores de SNS.
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    throw new SmsApiError(
      e.name ?? 'ErrorDesconocido',
      e.$metadata?.httpStatusCode ?? 0,
      e.message ?? 'Fallo publicando el SMS en SNS',
      { cause: err },
    );
  }
}
