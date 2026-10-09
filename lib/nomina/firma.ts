import { createHash, randomBytes } from 'crypto';

/**
 * firma.ts — token del enlace de firma + sello de integridad del contrato.
 *
 * El contrato se envía a firmar por un enlace público (sin sesión): el token de
 * la URL es toda la autorización, así que es de 256 bits y en la base vive solo
 * su SHA-256. Al firmar se calcula un sello = hash(cuerpo | firmante | fecha):
 * si alguien altera el texto del contrato archivado, el sello deja de cuadrar.
 *
 * Puro y sin BD/red a propósito, para probar formato y sello sin levantar nada.
 */

/** 32 bytes = 256 bits. No se adivina ni se enumera. */
export function generarTokenFirma(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo que se guarda: un volcado de la tabla no permite firmar por nadie. */
export function hashTokenFirma(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Forma esperada: 43 caracteres base64url. Filtra basura antes de tocar la BD. */
export function formatoTokenValido(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * Sello de integridad del contrato firmado. Amarra el texto exacto que se firmó
 * con quién y cuándo. Se guarda y se imprime en el PDF; recalcularlo sobre el
 * cuerpo archivado debe dar lo mismo (tamper-evidence).
 */
export function selloFirma(cuerpo: string, firmante: string, firmadoEnISO: string): string {
  return createHash('sha256').update(`${cuerpo}|${firmante}|${firmadoEnISO}`).digest('hex');
}

/** Prefijo esperado de la imagen de firma (PNG en data URL). */
const PREFIJO_PNG = 'data:image/png;base64,';
/** Tope del data URL de la firma: un trazo son ~10-40 KB; 500 KB es de sobra. */
const MAX_FIRMA_BYTES = 500 * 1024;

/** Valida que la firma recibida sea un PNG en data URL de tamaño razonable. */
export function firmaValida(dataUrl: unknown): dataUrl is string {
  return typeof dataUrl === 'string'
    && dataUrl.startsWith(PREFIJO_PNG)
    && dataUrl.length <= MAX_FIRMA_BYTES
    && dataUrl.length > PREFIJO_PNG.length + 100; // no un canvas vacío
}
