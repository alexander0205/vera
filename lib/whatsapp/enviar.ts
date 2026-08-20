import { resolverRemitente } from './config';
import { enviarMensaje, enviarPlantilla, WhatsAppApiError, type EnviarMensajeResult } from './client';

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

/**
 * La plantilla no existe, no está aprobada todavía, o los parámetros no cuadran.
 * Separada de la ventana de 24 h porque se arregla en otro sitio: esto se
 * resuelve en Meta, no esperando a que el padre conteste.
 */
export class WhatsAppPlantillaRechazadaError extends Error {
  constructor(public plantilla: string, detalle: string) {
    super(`Plantilla "${plantilla}": ${detalle}`);
    this.name = 'WhatsAppPlantillaRechazadaError';
  }
}

/** Espera `ms` milisegundos. Extraído para poder mockear en tests si hiciera falta. */
function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manda una plantilla aprobada.
 *
 * Esto es lo que hay que usar para los avisos de cobro. `enviarWhatsApp` manda
 * texto libre, y el texto libre solo pasa dentro de las 24 h siguientes al
 * último mensaje del contacto: fuera de esa ventana WhatsApp devuelve 422 y el
 * aviso no sale. Un padre al que hay que recordarle una mensualidad lleva, por
 * definición, semanas sin escribirnos.
 */
export async function enviarWhatsAppPlantilla(
  teamId: number,
  telefono: string,
  plantilla: { nombre: string; idioma?: string; parametros?: string[]; botonUrl?: string | null },
): Promise<EnviarMensajeResult> {
  const remitente = await resolverRemitente(teamId);
  if (!remitente) throw new WhatsAppNoConectadoError();

  try {
    return await enviarPlantilla(remitente.apiKey, telefono, plantilla);
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      if (err.status === 409) throw new WhatsAppNoConectadoError();
      // 422 aquí no es la ventana de 24 h —una plantilla no la tiene— sino que
      // la plantilla no existe, no está aprobada todavía, o le faltan parámetros.
      if (err.status === 422) throw new WhatsAppPlantillaRechazadaError(plantilla.nombre, err.message);
      if (err.status === 429) {
        await esperar(2000);
        return await enviarPlantilla(remitente.apiKey, telefono, plantilla);
      }
    }
    throw err;
  }
}

export async function enviarWhatsApp(
  teamId: number,
  telefono: string,
  texto: string,
): Promise<EnviarMensajeResult> {
  // Su número si lo conectó; si no, el de Zero. Ver resolverRemitente.
  const remitente = await resolverRemitente(teamId);
  if (!remitente) {
    throw new WhatsAppNoConectadoError();
  }

  try {
    return await enviarMensaje(remitente.apiKey, telefono, texto);
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      if (err.status === 409) throw new WhatsAppNoConectadoError();
      if (err.status === 422) throw new WhatsAppFueraDeVentanaError(err.message);
      if (err.status === 429) {
        await esperar(2000);
        return await enviarMensaje(remitente.apiKey, telefono, texto);
      }
    }
    throw err;
  }
}
