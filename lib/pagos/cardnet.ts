/**
 * Cliente CardNet — Botón de pago "con pantalla" (hosted page + 3DS).
 *
 * Flujo (nunca tocamos la tarjeta → sin alcance PCI en nuestros servidores):
 *   1. crearSesion()   → POST {base}/sessions  → { session, sessionKey }
 *   2. El cliente hace POST {base}/authorize con el campo SESSION (form auto-submit
 *      desde /pay/[token]); CardNet muestra su gateway y captura la tarjeta.
 *   3. CardNet redirige a ReturnUrl/CancelUrl.
 *   4. consultarSesion() → GET {base}/sessions/{id}?sk= → resultado AUTORITATIVO.
 *      Confiamos en esto, no en los parámetros del redirect del browser.
 *
 * Credenciales de comercio: por empresa, en payment_provider_config (cifradas).
 * Sandbox público CardNet: merchant 349041263, terminal 77777777, currency 214.
 *
 * Doc: https://developers.cardnet.com.do/guias/boton-de-pago/web-con-pantalla-post-3ds.html
 */

import { decryptField, isEncrypted, type Encrypted } from '@/lib/crypto/cert';

const SANDBOX_BASE = process.env.CARDNET_SANDBOX_BASE || 'https://labservicios.cardnet.com.do';
const PROD_BASE    = process.env.CARDNET_PROD_BASE    || 'https://ecommerce.cardnet.com.do';

/** Moneda ISO 4217 numérica para DOP. */
export const CARDNET_CURRENCY_DOP = '214';

export interface CardnetConfig {
  merchantNumber:   string;
  merchantTerminal: string;
  merchantName:     string;
  ambiente:         'sandbox' | 'prod';
  /** Código de institución adquirente (lo asigna el ejecutivo; sandbox default). */
  acquiringInstitutionCode?: string;
}

export interface CrearSesionParams {
  /** Monto TOTAL en centavos (incluye ITBIS). */
  amountCentavos: number;
  /** ITBIS en centavos. */
  taxCentavos:    number;
  ordenId:        string;
  transactionId:  string;
  returnUrl:      string;
  cancelUrl:      string;
}

export interface CrearSesionResult {
  session:    string;
  sessionKey: string;
}

/** Resultado autoritativo de una sesión consultada. */
export interface ConsultaSesionResult {
  responseCode:      string;   // '00' = aprobado
  aprobado:          boolean;
  authorizationCode: string | null;
  retrievalRef:      string | null;
  cardMask:          string | null;
  raw:               unknown;
}

function baseUrl(ambiente: 'sandbox' | 'prod'): string {
  return ambiente === 'prod' ? PROD_BASE : SANDBOX_BASE;
}

/** URL a la que el navegador hace POST con el campo SESSION. */
export function authorizeUrl(ambiente: 'sandbox' | 'prod'): string {
  return `${baseUrl(ambiente)}/authorize`;
}

/**
 * Descifra la config de comercio guardada en payment_provider_config.
 * Devuelve null si faltan credenciales (comercio no configurado).
 */
export function resolveCardnetConfig(row: {
  merchantId:  string | null;
  terminalId:  string | null;
  ambiente:    string;
  authKey:     unknown;
} | null | undefined, merchantName: string): CardnetConfig | null {
  if (!row || !row.merchantId || !row.terminalId) return null;

  // authKey cifrada opcional (institución adquirente / clave). No es obligatoria
  // para levantar la sesión en sandbox, pero se descifra si existe.
  let acquiring: string | undefined;
  const enc = row.authKey as Encrypted | null;
  if (enc && isEncrypted(enc.ciphered, enc.iv, enc.authTag)) {
    try { acquiring = decryptField(enc); } catch { acquiring = undefined; }
  }

  return {
    merchantNumber:   row.merchantId,
    merchantTerminal: row.terminalId,
    merchantName,
    ambiente:         row.ambiente === 'prod' ? 'prod' : 'sandbox',
    acquiringInstitutionCode: acquiring,
  };
}

/**
 * CardNet espera Amount/Tax en CENTAVOS enteros como string (sin punto).
 * Ej: RD$2,950.00 → "295000". Verificado contra el gateway real: enviar
 * "2950.00" hacía que mostrara RD$29.50 (lo tomaba como 2950 centavos).
 */
function centavosToCardnet(centavos: number): string {
  return String(Math.round(centavos));
}

/**
 * Crea la sesión de transacción en CardNet. Devuelve el SESSION uuid y su
 * session-key. Lanza en error de red / respuesta inválida — el caller decide
 * marcar el link como fallido (nunca se pierde: el link queda 'pendiente').
 */
export async function crearSesion(
  cfg: CardnetConfig,
  p: CrearSesionParams,
): Promise<CrearSesionResult> {
  const body = {
    TransactionType:          '0200', // venta
    CurrencyCode:             CARDNET_CURRENCY_DOP,
    Amount:                   centavosToCardnet(p.amountCentavos),
    Tax:                      centavosToCardnet(p.taxCentavos),
    MerchantNumber:           cfg.merchantNumber,
    MerchantTerminal:         cfg.merchantTerminal,
    MerchantName:             cfg.merchantName,
    OrdenId:                  p.ordenId,
    TransactionId:            p.transactionId,
    ReturnUrl:                p.returnUrl,
    CancelUrl:                p.cancelUrl,
    PageLanguaje:             'ESP',
    AcquiringInstitutionCode: cfg.acquiringInstitutionCode ?? '',
  };

  const res = await fetch(`${baseUrl(cfg.ambiente)}/sessions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`CardNet /sessions ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const session    = String(json.SESSION ?? json.session ?? '');
  const sessionKey = String(json['session-key'] ?? json.sessionKey ?? '');
  if (!session) throw new Error('CardNet /sessions no devolvió SESSION');

  return { session, sessionKey };
}

/**
 * Consulta el resultado AUTORITATIVO de una sesión. Es la fuente de verdad del
 * pago: nunca marcamos pagado solo por el redirect del browser.
 */
export async function consultarSesion(
  cfg: CardnetConfig,
  session: string,
  sessionKey: string,
): Promise<ConsultaSesionResult> {
  const url = `${baseUrl(cfg.ambiente)}/sessions/${encodeURIComponent(session)}?sk=${encodeURIComponent(sessionKey)}`;
  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`CardNet GET /sessions ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const responseCode = String(json.ResponseCode ?? json.responseCode ?? '');

  return {
    responseCode,
    aprobado:          responseCode === '00',
    authorizationCode: (json.AuthorizationCode as string) ?? null,
    retrievalRef:      (json.RetrievalReferenceNumber as string) ?? null,
    cardMask:          (json.CreditCardNumber as string) ?? null,
    raw:               json,
  };
}
