/**
 * Cliente HTTP para la API pública de crm-escolar (WhatsApp por negocio).
 * Contrato: crm-escolar/docs/api-publica.md. Todas las llamadas server-side;
 * las keys nunca salen al browser.
 */

function baseUrl() {
  return process.env.CRM_ZERO_API_URL!.replace(/\/+$/, '');
}

export class WhatsAppApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new WhatsAppApiError(res.status, data.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface CrearNegocioResult {
  ok: boolean;
  negocioId: string;
  slug: string;
  apiKey: string;
  connectUrl: string;
}

/**
 * Crea el negocio del team en crm-escolar. Requiere CRM_ZERO_PARTNER_KEY
 * (server-side). `email` es obligatorio para la API de crm-escolar (confirmado
 * probando en vivo: sin él responde 400 "email must be a valid email").
 */
export async function crearNegocio(
  nombre: string,
  email: string,
  vertical: 'colegio' | 'clinica' | 'general',
): Promise<CrearNegocioResult> {
  const partnerKey = process.env.CRM_ZERO_PARTNER_KEY;
  if (!partnerKey) {
    throw new WhatsAppApiError(503, 'CRM_ZERO_PARTNER_KEY no configurado');
  }
  const res = await fetch(`${baseUrl()}/negocios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-partner-key': partnerKey },
    body: JSON.stringify({ nombre, email, vertical }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new WhatsAppApiError(res.status, data.error ?? res.statusText);
  }
  return res.json();
}

export interface ConnectUrlResult {
  whatsappConnected: boolean;
  displayPhoneNumber?: string;
  connectUrl: string;
}

/** Genera/renueva el link de conexión de Meta (dura 24h) para un negocio ya creado. */
export function generarConnectUrl(apiKey: string): Promise<ConnectUrlResult> {
  return request<ConnectUrlResult>('POST', '/connect-url', apiKey);
}

export interface EnviarMensajeResult {
  messageId: string;
  conversationId: string;
}

export function enviarMensaje(apiKey: string, to: string, text: string): Promise<EnviarMensajeResult> {
  return request<EnviarMensajeResult>('POST', '/messages', apiKey, { to, text });
}

export interface RegistrarWebhookResult {
  ok: boolean;
  id: string;
  secret: string;
}

export function registrarWebhook(apiKey: string, url: string): Promise<RegistrarWebhookResult> {
  return request<RegistrarWebhookResult>('POST', '/webhooks', apiKey, { url });
}
