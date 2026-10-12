/**
 * Cliente HTTP para la API pública de crm-escolar (WhatsApp por negocio).
 * Contrato: crm-escolar/docs/api-publica.md. Todas las llamadas server-side;
 * las keys nunca salen al browser.
 */

function baseUrl() {
  // Sin el `!`: con la asertion, olvidar esta variable reventaba con un
  // "Cannot read properties of undefined (reading 'replace')" que no dice nada
  // de WhatsApp ni de qué falta.
  const url = process.env.CRM_ZERO_API_URL;
  if (!url) throw new WhatsAppApiError(503, 'CRM_ZERO_API_URL no configurado');
  return url.replace(/\/+$/, '');
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

/**
 * Estado de la conexión según el CRM.
 *
 * `whatsappLinked` y `whatsappCanSend` son DOS cosas distintas, y confundirlas
 * cuesta caro: un número recién vinculado que no quedó registrado en la Cloud
 * API sale como conectado y rechaza cada envío con
 * `(#133010) Account not registered`. Para decidir si se puede enviar se mira
 * `whatsappCanSend`, nunca `whatsappConnected`.
 *
 * Los campos nuevos van opcionales porque el CRM todavía puede estar sirviendo
 * la versión anterior, que solo mandaba `whatsappConnected`.
 */
export type EstadoConexionCrm =
  | 'listo' | 'necesita_registro' | 'vinculado' | 'error' | 'no_conectado';

export interface ConnectUrlResult {
  /** Compatibilidad: es igual a `whatsappLinked`. No sirve para decidir si se envía. */
  whatsappConnected: boolean;
  whatsappLinked?: boolean;
  whatsappCanSend?: boolean;
  estadoConexion?: EstadoConexionCrm;
  /** El estado en bonito, listo para pintar ("Vinculado", "Listo"…). */
  estadoLabel?: string;
  estadoDescripcion?: string;
  displayPhoneNumber?: string;
  connectUrl: string;
  expiresInHours?: number;
}

/** Genera/renueva el link de conexión de Meta (dura 24h) para un negocio ya creado. */
export function generarConnectUrl(apiKey: string): Promise<ConnectUrlResult> {
  return request<ConnectUrlResult>('POST', '/connect-url', apiKey);
}

/**
 * Suelta el canal de WhatsApp del negocio: desuscribe la WABA en Meta y borra
 * las credenciales. Las conversaciones se conservan.
 *
 * Hace falta para CAMBIAR de número. Conectar uno nuevo también pisa al
 * anterior sin desconectar, pero entonces la WABA vieja se queda suscrita al
 * webhook: seguirían llegando entrantes de un canal que ya no se usa.
 */
export function desconectarWhatsApp(apiKey: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('DELETE', '/whatsapp', apiKey);
}

export interface EnviarMensajeResult {
  messageId: string;
  conversationId: string;
}

export function enviarMensaje(apiKey: string, to: string, text: string): Promise<EnviarMensajeResult> {
  return request<EnviarMensajeResult>('POST', '/messages', apiKey, { to, text });
}

/**
 * Manda una plantilla aprobada. Es la ÚNICA forma de escribirle a alguien que
 * lleva más de 24 h sin escribirnos — o sea, la única que sirve para un aviso
 * de cobro, que sale justo cuando el padre lleva semanas callado.
 *
 * `parametros` rellena {{1}}, {{2}}… del cuerpo, en orden.
 *
 * `botonUrl` rellena la variable de un botón de enlace. EL CRM TODAVÍA NO LO
 * SOPORTA: su `POST /api/v1/messages` solo documenta y acepta `bodyParameters`.
 * Se manda de todos modos porque un campo que el CRM ignora no rompe nada, y el
 * día que lo implemente esto ya está listo — se enciende con
 * `CRM_BOTONES_PLANTILLA=1` y no hay que tocar código. Hasta entonces el motor
 * de avisos se niega a usar plantillas con botón (ver `PlantillaAsignada.conBoton`).
 */
export function enviarPlantilla(
  apiKey: string,
  to: string,
  plantilla: { nombre: string; idioma?: string; parametros?: string[]; botonUrl?: string | null },
): Promise<EnviarMensajeResult> {
  return request<EnviarMensajeResult>('POST', '/messages', apiKey, {
    to,
    type: 'template',
    template: {
      name: plantilla.nombre,
      languageCode: plantilla.idioma ?? 'es',
      bodyParameters: plantilla.parametros ?? [],
      // Simétrico con `bodyParameters`: el índice es la posición del botón, y
      // hoy solo hay uno. Meta solo admite una variable por botón de URL.
      ...(plantilla.botonUrl ? { buttonParameters: [plantilla.botonUrl] } : {}),
    },
  });
}

/** El CRM ya rellena la variable del botón. Apagado hasta que la implemente. */
export const CRM_SOPORTA_BOTONES = process.env.CRM_BOTONES_PLANTILLA === '1';

export interface ContenidoPlantilla {
  body: string;
  header: string | null;
  footer: string | null;
  /** Ejemplos de Meta: array de arrays, uno por componente con variables. */
  example: string[][] | null;
}

export interface PlantillaCrm {
  id: string;
  name: string;
  language: string;
  category: string;
  /** APPROVED · PENDING · PENDING_REVIEW · REJECTED · PAUSED · DISABLED */
  status: string;
  aprobado: boolean;
  rejectedReason: string | null;
  /** El texto real, ya normalizado por el CRM. Es la verdad del contenido. */
  content?: ContenidoPlantilla;
}

/**
 * Plantillas del negocio con su estado de aprobación.
 *
 * Meta aprueba de forma asíncrona: al crearlas quedan en PENDING y pasan a
 * APPROVED o REJECTED en minutos, a veces horas. Enviar una que no esté
 * aprobada da 422, así que esto es lo que hay que mirar antes de programar
 * una tanda de avisos.
 */
export function listarPlantillas(apiKey: string, nombre?: string): Promise<{ templates: PlantillaCrm[] }> {
  const qs = nombre ? `?name=${encodeURIComponent(nombre)}` : '';
  return request<{ templates: PlantillaCrm[] }>('GET', `/templates${qs}`, apiKey);
}

export interface CrearPlantillaResult {
  ok: boolean;
  id: string;
  name: string;
  status: string;
  aprobado: boolean;
}

/**
 * Registra una plantilla en Meta.
 *
 * `ejemploCuerpo` es obligatorio si el cuerpo lleva variables: Meta rechaza
 * las plantillas sin un ejemplo por cada {{n}}.
 */
export interface PlantillaEscribible {
  nombre: string;
  categoria: 'utility' | 'marketing' | 'authentication';
  idioma?: string;
  cuerpo: string;
  ejemploCuerpo?: string[];
  encabezado?: string;
  pie?: string;
  /** Botón de enlace. Obliga a mandar `components` crudo — ver abajo. */
  boton?: { texto: string; url: string; ejemplo: string };
}

/**
 * La plantilla en el formato crudo de Meta.
 *
 * Se usa SOLO cuando hay botón: los campos sencillos del CRM (`body`,
 * `header`, `footer`) no tienen dónde meterlo, y su documentación dice que
 * para eso se manda el array tal cual. Y como `components` REEMPLAZA a los
 * campos sencillos, hay que armar la plantilla entera, no solo el botón.
 */
function componentsDeMeta(p: PlantillaEscribible) {
  const components: Record<string, unknown>[] = [];

  if (p.encabezado) {
    components.push({ type: 'HEADER', format: 'TEXT', text: p.encabezado });
  }

  components.push({
    type: 'BODY',
    text: p.cuerpo,
    // Meta espera un array de arrays: una tanda de ejemplos por plantilla.
    ...(p.ejemploCuerpo?.length ? { example: { body_text: [p.ejemploCuerpo] } } : {}),
  });

  if (p.pie) components.push({ type: 'FOOTER', text: p.pie });

  if (p.boton) {
    const conVariable = /\{\{\d+\}\}/.test(p.boton.url);
    components.push({
      type: 'BUTTONS',
      buttons: [{
        type: 'URL',
        text: p.boton.texto,
        url: p.boton.url,
        // El ejemplo solo va si la URL lleva variable; con URL fija, Meta lo rechaza.
        ...(conVariable ? { example: [p.boton.ejemplo] } : {}),
      }],
    });
  }

  return components;
}

function cuerpoPeticion(p: PlantillaEscribible) {
  const base = {
    name: p.nombre,
    category: p.categoria,
    language: p.idioma ?? 'es',
  };

  if (p.boton) return { ...base, components: componentsDeMeta(p) };

  return {
    ...base,
    body: p.cuerpo,
    ...(p.ejemploCuerpo?.length ? { bodyExample: p.ejemploCuerpo } : {}),
    ...(p.encabezado ? { header: p.encabezado } : {}),
    ...(p.pie ? { footer: p.pie } : {}),
  };
}

export function crearPlantilla(apiKey: string, p: PlantillaEscribible): Promise<CrearPlantillaResult> {
  return request<CrearPlantillaResult>('POST', '/templates', apiKey, cuerpoPeticion(p));
}

/**
 * Reemplaza el contenido de una plantilla ya existente en Meta.
 *
 * Las reglas las pone Meta y conviene saberlas antes de ofrecer el botón:
 * el nombre y el idioma NO se pueden cambiar; el cuerpo, encabezado y pie se
 * reemplazan enteros; una aprobada admite 10 ediciones por cada 30 días y solo
 * 1 cada 24 h; una rechazada o pausada, las que haga falta; y **una que está en
 * revisión no se puede editar**. Después de editar vuelve a revisión.
 */
export function editarPlantilla(apiKey: string, p: PlantillaEscribible): Promise<CrearPlantillaResult> {
  return request<CrearPlantillaResult>('PUT', '/templates', apiKey, cuerpoPeticion(p));
}

export interface ConversacionCrm {
  id: string;
  phone: string;
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  /**
   * false cuando pasaron más de 24 h desde el último mensaje del contacto.
   * Fuera de esa ventana WhatsApp solo acepta plantillas, así que un texto
   * libre se rechaza con 422 por más que el número esté conectado.
   */
  canReply: boolean;
}

/** Conversaciones del negocio, más reciente primero. */
export function listarConversaciones(apiKey: string): Promise<{ conversations: ConversacionCrm[] }> {
  return request<{ conversations: ConversacionCrm[] }>('GET', '/conversations', apiKey);
}

export interface MensajeCrm {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  type: string;
  text: string | null;
  externalMessageId: string | null;
  deliveryStatus: string | null;
  /**
   * El motivo real de Meta cuando `deliveryStatus` es 'fallido'. Es lo que
   * distingue «no tiene WhatsApp» de «fuera de la ventana de 24 h» de «nos
   * bloqueó» — sin esto, todo fallo se ve igual y hay que adivinar.
   */
  errorDelivery?: string | null;
  timestamp: string;
}

/** Historial de una conversación, en orden cronológico. */
export function listarMensajes(
  apiKey: string,
  params: { conversationId?: string; phone?: string; limit?: number },
): Promise<{ messages: MensajeCrm[] }> {
  const qs = new URLSearchParams();
  if (params.conversationId) qs.set('conversationId', params.conversationId);
  if (params.phone) qs.set('phone', params.phone);
  if (params.limit) qs.set('limit', String(params.limit));
  return request<{ messages: MensajeCrm[] }>('GET', `/messages?${qs.toString()}`, apiKey);
}

export interface RegistrarWebhookResult {
  ok: boolean;
  id: string;
  secret: string;
}

export function registrarWebhook(apiKey: string, url: string): Promise<RegistrarWebhookResult> {
  return request<RegistrarWebhookResult>('POST', '/webhooks', apiKey, { url });
}

/**
 * Un mensaje del historial, con su acuse.
 *
 * `deliveryStatus` es la única verdad sobre si llegó: el 201 del envío solo
 * dice que Meta aceptó la petición. Comprobado — cuatro avisos devolvieron
 * `ok:true` y los cuatro fallaron después con `131042`.
 */
export interface MensajeHistorial {
  id: string;
  conversationId: string;
  externalMessageId: string | null;
  direction: 'inbound' | 'outbound';
  /** enviado | entregado | leido | fallido */
  deliveryStatus: string | null;
  /** El motivo real de Meta cuando falla. Distingue «no tiene WhatsApp» de
   *  «fuera de la ventana» de «la cuenta no puede cobrar». */
  errorDelivery: string | null;
  text: string | null;
  timestamp: string | null;
}

/** El historial de un número. `phone` va en E.164 sin `+` — ver aE164(). */
export function historialMensajes(
  apiKey: string, phone: string,
): Promise<{ messages: MensajeHistorial[] }> {
  return request<{ messages: MensajeHistorial[] }>(
    'GET', `/messages?phone=${encodeURIComponent(phone)}`, apiKey,
  );
}
