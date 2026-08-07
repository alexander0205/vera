/**
 * Almacenamiento de comprobantes de pago — S3 privado.
 *
 * Decisiones de seguridad, para que no se aflojen sin querer:
 *
 * 1. NUNCA se emiten presigned URLs. Una presigned URL es un token bearer en un
 *    query string: cae en el historial del navegador, en headers Referer y en
 *    logs, y mientras vive no pregunta quién la usa. En su lugar el binario se
 *    sirve por `/api/pagos/adjuntos/[id]`, que valida sesión y team antes de
 *    leer de S3. Efecto lateral bueno: el browser nunca habla con S3, así que
 *    el bucket no necesita CORS.
 * 2. NUNCA se sube con presigned PUT. Eso entregaría capacidad de escritura
 *    saltándose la validación de tipo, tamaño y permiso.
 * 3. La llave lleva un UUID, nunca el id del adjunto ni el del pago: aunque una
 *    política se afloje, no se pueden enumerar los comprobantes de nadie.
 *
 * El usuario IAM está scopeado a `${prefijo}/*` y no tiene ListBucket — la app
 * siempre conoce la llave exacta porque la guarda en la DB.
 *
 * Sin credenciales configuradas (desarrollo local), `s3Disponible()` da false y
 * el llamador cae al fallback base64 en Postgres (`storage='db'`).
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const BUCKET = process.env.S3_COMPROBANTES_BUCKET;
const REGION = process.env.S3_COMPROBANTES_REGION ?? 'us-east-1';
const PREFIX = process.env.S3_COMPROBANTES_PREFIX ?? 'preview';
const KEY_ID = process.env.S3_COMPROBANTES_KEY_ID;
const SECRET = process.env.S3_COMPROBANTES_SECRET;

export function s3Disponible(): boolean {
  return Boolean(BUCKET && KEY_ID && SECRET);
}

let cliente: S3Client | null = null;
function getCliente(): S3Client {
  if (!cliente) {
    if (!s3Disponible()) throw new Error('S3 de comprobantes no configurado');
    cliente = new S3Client({
      region: REGION,
      credentials: { accessKeyId: KEY_ID!, secretAccessKey: SECRET! },
    });
  }
  return cliente;
}

/** `prod/team_12/pago/<uuid>.jpg` — el UUID hace la llave no adivinable. */
export function construirKey(teamId: number, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `${PREFIX}/team_${teamId}/pago/${randomUUID()}.${ext}`;
}

/** Llave de la miniatura, derivada de la del original: `<uuid>_thumb.jpg`. */
export function construirThumbKey(keyOriginal: string): string {
  return keyOriginal.replace(/\.[^.]+$/, '') + '_thumb.jpg';
}

export async function subirComprobante(
  key: string,
  cuerpo: Buffer,
  mime: string,
): Promise<void> {
  await getCliente().send(new PutObjectCommand({
    Bucket:      BUCKET!,
    Key:         key,
    Body:        cuerpo,
    ContentType: mime,
    // Sin ACL: el bucket está en BucketOwnerEnforced, las ACLs están desactivadas.
    // El cifrado en reposo lo aplica el bucket por defecto (SSE-S3).
  }));
}

export async function leerComprobante(key: string): Promise<Buffer> {
  const res = await getCliente().send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
  if (!res.Body) throw new Error('Objeto vacío en S3');
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function borrarComprobante(key: string): Promise<void> {
  await getCliente().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
}
