import { getWhatsAppConfig } from './config';
import { enviarMensaje, WhatsAppApiError, type EnviarMensajeResult } from './client';

export class WhatsAppNoConectadoError extends Error {
  constructor() {
    super('WhatsApp no está conectado para este negocio.');
    this.name = 'WhatsAppNoConectadoError';
  }
}

export class WhatsAppFueraDeVentanaError extends Error {
  constructor(detalle: string) {
    super(detalle);
    this.name = 'WhatsAppFueraDeVentanaError';
  }
}

/** Espera `ms` milisegundos. Extraído para poder mockear en tests si hiciera falta. */
function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enviarWhatsApp(
  teamId: number,
  telefono: string,
  texto: string,
): Promise<EnviarMensajeResult> {
  const config = await getWhatsAppConfig(teamId);
  if (!config || !config.conectado) {
    throw new WhatsAppNoConectadoError();
  }

  try {
    return await enviarMensaje(config.apiKey, telefono, texto);
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      if (err.status === 409) throw new WhatsAppNoConectadoError();
      if (err.status === 422) throw new WhatsAppFueraDeVentanaError(err.message);
      if (err.status === 429) {
        await esperar(2000);
        return await enviarMensaje(config.apiKey, telefono, texto);
      }
    }
    throw err;
  }
}
