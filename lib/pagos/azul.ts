/**
 * Cliente Azul — Payment Page (hosted form + AuthHash).
 *
 * Flujo (nunca tocamos la tarjeta → sin alcance PCI):
 *   1. buildPaymentPageForm() → arma los campos + AuthHash.
 *   2. El navegador hace POST a {paymentPageUrl} con TODOS los campos + AuthHash
 *      (form auto-submit desde /pay/[token]). Azul muestra su pantalla y cobra.
 *   3. Azul hace POST a ApprovedUrl/DeclinedUrl/CancelUrl con el resultado + su
 *      propio AuthHash de respuesta.
 *   4. verifyResponseHash() valida la firma → nunca confiamos en el redirect solo.
 *
 * Credenciales del comercio (payment_provider_config, cifradas):
 *   merchantId → MerchantId · authKey → Auth1 · apiKey → Auth2
 *
 * ⚠️ AuthHash: Azul tiene dos variantes según la versión de tu contrato/PDF:
 *   - 'hmac'  (doc 2023): HMAC-SHA512(concat(campos)+Auth1, key=Auth2) hex.
 *   - 'sha512-utf16' (legacy): SHA512(UTF-16LE(concat(campos)+Auth1)) hex, 1 llave.
 * El ORDEN de los campos es idéntico en ambas. Si el hash no coincide contra tu
 * cuenta real, cambia AZUL_HASH_MODE o revisa el orden aquí — está todo en un
 * solo lugar (azulAuthHash + los arrays de orden).
 *
 * Doc: https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx
 */

import { createHmac, createHash } from 'crypto';
import { decryptField, isEncrypted, type Encrypted } from '@/lib/crypto/cert';

const SANDBOX_URL = process.env.AZUL_SANDBOX_URL || 'https://pruebas.azul.com.do/PaymentPage/';
const PROD_URL    = process.env.AZUL_PROD_URL    || 'https://pagos.azul.com.do/PaymentPage/';

/** Variante de AuthHash. 'hmac' = doc 2023; 'sha512-utf16' = legacy. */
const AZUL_HASH_MODE: 'hmac' | 'sha512-utf16' =
  (process.env.AZUL_HASH_MODE as 'hmac' | 'sha512-utf16') || 'hmac';

export interface AzulConfig {
  merchantId:   string;
  merchantName: string;
  auth1:        string;
  auth2:        string;
  ambiente:     'sandbox' | 'prod';
}

export function paymentPageUrl(ambiente: 'sandbox' | 'prod'): string {
  return ambiente === 'prod' ? PROD_URL : SANDBOX_URL;
}

/**
 * Descifra la config de Azul. Devuelve null si faltan credenciales.
 * authKey → Auth1 · apiKey → Auth2 (ambas cifradas).
 */
export function resolveAzulConfig(row: {
  merchantId: string | null;
  ambiente:   string;
  authKey:    unknown;
  apiKey:     unknown;
} | null | undefined, merchantName: string): AzulConfig | null {
  if (!row || !row.merchantId) return null;
  const auth1 = decryptMaybe(row.authKey);
  const auth2 = decryptMaybe(row.apiKey);
  if (!auth1 || !auth2) return null;
  return {
    merchantId:   row.merchantId,
    merchantName: (merchantName || 'Comercio').slice(0, 50),
    auth1, auth2,
    ambiente:     row.ambiente === 'prod' ? 'prod' : 'sandbox',
  };
}

function decryptMaybe(enc: unknown): string | null {
  const e = enc as Encrypted | null;
  if (e && isEncrypted(e.ciphered, e.iv, e.authTag)) {
    try { return decryptField(e); } catch { return null; }
  }
  return null;
}

/**
 * AuthHash de Azul. El string ya viene concatenado (valores en orden + Auth1).
 * Ver nota de cabecera para las dos variantes.
 */
function azulAuthHash(concatConAuth1: string, auth2: string): string {
  if (AZUL_HASH_MODE === 'sha512-utf16') {
    // SHA512 sobre los bytes UTF-16LE del string (incluye Auth1; sin Auth2/HMAC).
    const buf = Buffer.from(concatConAuth1, 'utf16le');
    return createHash('sha512').update(buf).digest('hex');
  }
  // HMAC-SHA512: mensaje = campos + Auth1, clave = Auth2.
  return createHmac('sha512', auth2).update(concatConAuth1, 'utf8').digest('hex');
}

export interface BuildFormParams {
  amountCentavos: number;
  itbisCentavos:  number;
  orderNumber:    string;
  approvedUrl:    string;
  declinedUrl:    string;
  cancelUrl:      string;
  responsePostUrl: string;
}

/** Campos del form de la Payment Page (orden ESENCIAL para el hash). */
export function buildPaymentPageForm(cfg: AzulConfig, p: BuildFormParams): {
  action: string;
  fields: Record<string, string>;
} {
  // Amount/ITBIS: centavos como entero string, sin punto ni coma.
  const amount = String(Math.round(p.amountCentavos));
  const itbis  = String(Math.round(p.itbisCentavos));

  // El orden de este objeto ES el orden de concatenación del AuthHash.
  const ordered: Record<string, string> = {
    MerchantId:       cfg.merchantId,
    MerchantName:     cfg.merchantName,
    MerchantType:     'ecommerce',
    CurrencyCode:     '$',
    OrderNumber:      p.orderNumber,
    Amount:           amount,
    ITBIS:            itbis,
    ApprovedUrl:      p.approvedUrl,
    DeclinedUrl:      p.declinedUrl,
    CancelUrl:        p.cancelUrl,
    ResponsePostUrl:  p.responsePostUrl,
    UseCustomField1:  '0',
    CustomField1Label: '',
    CustomField1Value: '',
    UseCustomField2:  '0',
    CustomField2Label: '',
    CustomField2Value: '',
  };

  // Concatenar todos los valores en orden + Auth1, luego hashear con Auth2.
  const concat = Object.values(ordered).join('') + cfg.auth1;
  const authHash = azulAuthHash(concat, cfg.auth2);

  return {
    action: paymentPageUrl(cfg.ambiente),
    fields: { ...ordered, AuthHash: authHash },
  };
}

export interface AzulResponse {
  aprobado:          boolean;
  responseCode:      string;   // IsoCode: '00' = aprobado
  authorizationCode: string | null;
  cardMask:          string | null;
  rrn:               string | null;
  hashValido:        boolean;
}

/**
 * Verifica el AuthHash de la respuesta de Azul y devuelve el resultado.
 * Orden de campos de respuesta (ESENCIAL): OrderNumber, Amount, AuthorizationCode,
 * DateTime, ResponseCode, IsoCode, ResponseMessage, ErrorDescription, RRN + Auth1.
 * Nunca marcamos pagado si hashValido=false.
 */
export function verifyResponseHash(cfg: AzulConfig, r: Record<string, string>): AzulResponse {
  const concat = [
    r.OrderNumber ?? '',
    r.Amount ?? '',
    r.AuthorizationCode ?? '',
    r.DateTime ?? '',
    r.ResponseCode ?? '',
    r.IsoCode ?? '',
    r.ResponseMessage ?? '',
    r.ErrorDescription ?? '',
    r.RRN ?? '',
  ].join('') + cfg.auth1;

  const esperado = azulAuthHash(concat, cfg.auth2);
  const recibido = (r.AuthHash ?? '').toLowerCase();
  const hashValido = esperado.toLowerCase() === recibido;
  const iso = r.IsoCode ?? '';

  return {
    aprobado:          hashValido && iso === '00',
    responseCode:      iso,
    authorizationCode: r.AuthorizationCode ?? null,
    cardMask:          r.CardNumber ?? null,
    rrn:               r.RRN ?? null,
    hashValido,
  };
}
