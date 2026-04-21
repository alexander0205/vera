/**
 * Cifrado AES-256-GCM para certificados P12, contraseñas y tokens sensibles.
 * Usa únicamente la API nativa `crypto` de Node.js — sin dependencias extras.
 *
 * Requiere la variable de entorno:
 *   CERT_MASTER_KEY=<64 chars hex>
 *
 * Para generar una nueva clave maestra (solo una vez):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * ⚠️  Si cambias CERT_MASTER_KEY DESPUÉS de tener datos cifrados,
 *     perderás acceso a todos los certificados. Guarda la key en un lugar seguro.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export interface Encrypted {
  ciphered: string; // base64
  iv:       string; // hex (16 bytes)
  authTag:  string; // hex (16 bytes — garantía de integridad GCM)
}

function getMasterKey(): Buffer {
  const raw = process.env.CERT_MASTER_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      '[cert.crypto] CERT_MASTER_KEY debe ser exactamente 64 caracteres hex (32 bytes). ' +
      'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(raw, 'hex');
}

/** Cifra cualquier string con AES-256-GCM. Cada llamada genera un IV único. */
export function encryptField(plaintext: string): Encrypted {
  const key = getMasterKey();
  const iv  = randomBytes(16);

  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphered: encrypted.toString('base64'),
    iv:       iv.toString('hex'),
    authTag:  cipher.getAuthTag().toString('hex'),
  };
}

/** Descifra un Encrypted producido por `encryptField`. Lanza si el authTag no coincide. */
export function decryptField(enc: Encrypted): string {
  const key = getMasterKey();

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(enc.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(enc.authTag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(enc.ciphered, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Devuelve true si los tres campos de un Encrypted están presentes y no vacíos. */
export function isEncrypted(
  ciphered?: string | null,
  iv?: string | null,
  authTag?: string | null,
): ciphered is string {
  return !!(ciphered && iv && authTag);
}
