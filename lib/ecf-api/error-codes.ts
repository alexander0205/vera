/**
 * Mapa de códigos `code` de ecf-api → mensaje user-friendly en español.
 *
 * Reglas:
 * - Parsear por `code` (machine-readable, estable).
 * - NUNCA matchear por `message` (cambia entre versiones).
 *
 * Catálogo oficial: ver doc "EcfAPI — Cambios recientes + códigos de error".
 */

import type { EcfApiDgiiDetail, EcfApiError } from './client';

/** Acción sugerida al cliente para un error. */
export type EcfApiErrorAction =
  | 'fix-payload'   // Usuario debe corregir input
  | 'next-ncf'      // Usar siguiente eNCF (consumir secuencia)
  | 'new-cert'      // Subir nuevo P12
  | 'add-range'     // Registrar rango NCF nuevo
  | 'retry-later'   // Reintentar pasivamente en 30s
  | 'auth'          // Re-autenticar / pedir key nueva
  | 'contact-support' // Caso crítico
  | 'show-message'; // Sin acción específica, mostrar mensaje y log

interface CodeMapEntry {
  mensaje: string;
  action:  EcfApiErrorAction;
  /** HTTP status sugerido en proxy emitedo (override del de ecf-api). */
  proxyStatus?: number;
}

/**
 * Mapa principal code → {mensaje, action}.
 *
 * Cobertura: catálogo doc EcfAPI v3 (auth, rate-limit, validación,
 * NCF, cert P12, recursos, DGII upstream, HTTP fallbacks).
 */
const CODE_MAP: Record<string, CodeMapEntry> = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  ECFA_AUTH_KEY_MISSING:           { mensaje: 'Configuración inválida del servicio. Contacta a soporte.', action: 'contact-support', proxyStatus: 500 },
  ECFA_AUTH_KEY_INVALID:           { mensaje: 'Configuración inválida del servicio. Contacta a soporte.', action: 'contact-support', proxyStatus: 500 },
  ECFA_AUTH_KEY_REVOKED:           { mensaje: 'Sesión con el servicio de firma revocada. Contacta a soporte.', action: 'contact-support', proxyStatus: 500 },
  ECFA_AUTH_KEY_EXPIRED:           { mensaje: 'Sesión con el servicio de firma expirada. Contacta a soporte.', action: 'contact-support', proxyStatus: 500 },
  ECFA_AUTH_INSUFFICIENT_PRIVILEGES: { mensaje: 'No tienes permisos para esta acción.', action: 'auth', proxyStatus: 403 },
  ECFA_AUTH_TENANT_SCOPE:          { mensaje: 'Este recurso pertenece a otra empresa.', action: 'auth', proxyStatus: 403 },

  // ── Rate limiting ──────────────────────────────────────────────────────────
  ECFA_RATE_LIMIT:                 { mensaje: 'Demasiadas solicitudes. Espera unos segundos y reintenta.', action: 'retry-later', proxyStatus: 429 },

  // ── Validación payload ─────────────────────────────────────────────────────
  ECFA_VALIDATION_PAYLOAD:         { mensaje: 'Los datos del comprobante no son válidos. Revisa los campos requeridos.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_VALIDATION_TOTALES:         { mensaje: 'Los totales no cuadran. Verifica los items, descuentos e ITBIS.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_VALIDATION_FECHA:           { mensaje: 'La fecha de emisión es inválida o está fuera del rango permitido por la DGII.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_VALIDATION_TIPO_COMPROBANTE: { mensaje: 'Tipo de comprobante no soportado o falta el formato (ECF/RFCE).', action: 'fix-payload', proxyStatus: 422 },

  // ── NCF / secuencias ───────────────────────────────────────────────────────
  ECFA_NCF_FORMATO_INVALIDO:       { mensaje: 'El e-NCF tiene un formato inválido. Debe ser E{tipo}{10 dígitos}.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_NCF_RANGO_AGOTADO:          { mensaje: 'No hay e-NCFs disponibles en el rango. Registra un rango nuevo en Secuencias.', action: 'add-range', proxyStatus: 422 },
  ECFA_NCF_RANGO_NOT_FOUND:        { mensaje: 'El e-NCF no cae en ningún rango activo registrado.', action: 'add-range', proxyStatus: 422 },
  ECFA_NCF_DUPLICADO:              { mensaje: 'Este e-NCF ya fue emitido. Verifica la secuencia o ajusta el siguiente número.', action: 'next-ncf', proxyStatus: 422 },

  // ── Certificados P12 ───────────────────────────────────────────────────────
  ECFA_CERT_NOT_FOUND:             { mensaje: 'No hay certificado P12 activo. Súbelo en Configuración → Certificado digital.', action: 'new-cert', proxyStatus: 422 },
  ECFA_CERT_EXPIRED:               { mensaje: 'El certificado P12 está vencido. Súbelo de nuevo con uno vigente.', action: 'new-cert', proxyStatus: 422 },
  ECFA_CERT_PASSWORD_INVALID:      { mensaje: 'La contraseña del certificado P12 es incorrecta.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_CERT_FORMAT_INVALID:        { mensaje: 'El archivo P12 está corrupto o tiene un formato inválido.', action: 'fix-payload', proxyStatus: 422 },

  // ── Recursos genéricos ─────────────────────────────────────────────────────
  ECFA_RESOURCE_NOT_FOUND:         { mensaje: 'Recurso no encontrado.', action: 'show-message', proxyStatus: 404 },
  ECFA_RESOURCE_CONFLICT:          { mensaje: 'Conflicto con el estado actual del recurso.', action: 'show-message', proxyStatus: 409 },
  ECFA_RESOURCE_INACTIVE:          { mensaje: 'El recurso existe pero está desactivado.', action: 'show-message', proxyStatus: 422 },

  // ── DGII upstream ──────────────────────────────────────────────────────────
  ECFA_DGII_REJECTED:               { mensaje: 'La DGII rechazó el comprobante.', action: 'show-message', proxyStatus: 422 },
  ECFA_DGII_NCF_DUPLICADO_UPSTREAM: { mensaje: 'La DGII reporta que este e-NCF ya fue usado. Usa el siguiente número.', action: 'next-ncf', proxyStatus: 422 },
  ECFA_DGII_TIPO_INGRESOS_INVALID: { mensaje: 'Tipo de ingresos faltante o inválido. Selecciona uno entre 1 y 6.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_DGII_INDICADOR_INVALID:     { mensaje: 'Indicador de Nota de Crédito inválido. Debe ser 1, 2 ó 3.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_DGII_REFERENCIA_INVALID:    { mensaje: 'La referencia es inválida: el NCF modificado no existe o el RNC comprador no es válido.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_DGII_FIRMA_INVALID:         { mensaje: 'La firma fue rechazada por la DGII. El certificado P12 puede estar mal autorizado.', action: 'contact-support', proxyStatus: 502 },
  ECFA_DGII_RNC_INVALID:           { mensaje: 'El RNC del emisor o comprador no está autorizado en la DGII.', action: 'fix-payload', proxyStatus: 422 },
  ECFA_DGII_AUTH_FAILED:           { mensaje: 'Falla de autenticación con la DGII. El certificado puede no estar autorizado. Contacta a soporte.', action: 'contact-support', proxyStatus: 502 },
  ECFA_DGII_UNREACHABLE:           { mensaje: 'La DGII no está disponible en este momento. Reintenta en unos segundos.', action: 'retry-later', proxyStatus: 503 },
  ECFA_DGII_TIMEOUT:               { mensaje: 'La DGII no respondió a tiempo. Reintenta en unos segundos.', action: 'retry-later', proxyStatus: 504 },
  ECFA_DGII_SERVER_ERROR:          { mensaje: 'La DGII reporta un error interno. Espera unos minutos y reintenta.', action: 'retry-later', proxyStatus: 503 },

  // ── HTTP fallbacks genéricos ───────────────────────────────────────────────
  HTTP_BAD_REQUEST:                { mensaje: 'Solicitud inválida.', action: 'fix-payload', proxyStatus: 400 },
  HTTP_UNAUTHORIZED:               { mensaje: 'No autorizado.', action: 'auth', proxyStatus: 401 },
  HTTP_FORBIDDEN:                  { mensaje: 'No tienes permisos para esta acción.', action: 'auth', proxyStatus: 403 },
  HTTP_NOT_FOUND:                  { mensaje: 'Recurso no encontrado.', action: 'show-message', proxyStatus: 404 },
  HTTP_CONFLICT:                   { mensaje: 'Conflicto con el estado actual.', action: 'show-message', proxyStatus: 409 },
  HTTP_UNPROCESSABLE:              { mensaje: 'Datos no procesables.', action: 'fix-payload', proxyStatus: 422 },
  HTTP_INTERNAL:                   { mensaje: 'Error interno del servicio de firma. Reintenta en unos minutos.', action: 'retry-later', proxyStatus: 502 },
  HTTP_BAD_GATEWAY:                { mensaje: 'El servicio de firma reporta un upstream caído.', action: 'retry-later', proxyStatus: 502 },
  HTTP_SERVICE_UNAVAILABLE:        { mensaje: 'Servicio de firma temporalmente no disponible.', action: 'retry-later', proxyStatus: 503 },
  HTTP_GATEWAY_TIMEOUT:            { mensaje: 'Timeout del servicio de firma.', action: 'retry-later', proxyStatus: 504 },
};

/**
 * Resuelve un `EcfApiError` a información estructurada para retornar al cliente:
 * mensaje user-friendly, action sugerida, status HTTP proxy, y contexto DGII si aplica.
 *
 * Si el error no tiene `code` (body no parseable o ecf-api viejo), cae a un
 * fallback basado en `err.humanMessage` + status.
 */
export function resolveEcfApiError(err: EcfApiError): {
  mensaje:     string;
  action:      EcfApiErrorAction;
  proxyStatus: number;
  code:        string | null;
  dgiiDetalle: EcfApiDgiiDetail | null;
} {
  // Camino feliz: ecf-api retornó `code` machine-readable.
  if (err.code && CODE_MAP[err.code]) {
    const entry = CODE_MAP[err.code];
    return {
      mensaje:     entry.mensaje,
      action:      entry.action,
      proxyStatus: entry.proxyStatus ?? (err.status >= 400 && err.status < 500 ? 422 : 502),
      code:        err.code,
      dgiiDetalle: err.dgii,
    };
  }

  // Fallback: code desconocido o ausente.
  const fallbackStatus = err.status >= 400 && err.status < 500 ? 422 : 502;
  return {
    mensaje:     fallbackMessage(err),
    action:      err.status >= 500 ? 'retry-later' : 'show-message',
    proxyStatus: fallbackStatus,
    code:        err.code,
    dgiiDetalle: err.dgii,
  };
}

/**
 * Mensaje de respaldo cuando el code no está en el catálogo. Toma
 * `err.humanMessage` directo y solo censura mensajes técnicos crudos.
 */
function fallbackMessage(err: EcfApiError): string {
  const raw = err.humanMessage.toLowerCase();
  // Filtrar mensajes técnicos crudos (Prisma, stack, etc.)
  if (raw.includes('prisma') || raw.includes('unique constraint') ||
      raw.includes('foreign key') || raw.includes('invocation')) {
    return 'Ocurrió un error procesando el comprobante. Intenta de nuevo en unos minutos.';
  }
  // Mensaje DGII directo (suele ser útil al usuario)
  if (err.dgii?.mensajes?.length) {
    const dgiiMsg = err.dgii.mensajes.map(m => m.valor).filter(Boolean).join('. ');
    if (dgiiMsg) return `DGII: ${dgiiMsg}`;
  }
  return err.humanMessage || 'Error al procesar la solicitud.';
}
