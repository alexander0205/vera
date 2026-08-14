/**
 * Almacenamiento de adjuntos de tickets — mismo patrón de seguridad que
 * lib/storage/comprobantes.ts: sin presigned URLs, todo pasa por rutas propias
 * que validan sesión antes de tocar S3. Ver ese archivo para el razonamiento
 * completo. Sin credenciales (dev local), s3Disponible() da false y el
 * llamador debe guardar el archivo en base64 en la tabla ticket_attachments
 * (storage='db') en vez de subirlo.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const BUCKET = process.env.S3_COMPROBANTES_BUCKET; // mismo bucket, prefix distinto
const REGION = process.env.S3_COMPROBANTES_REGION ?? 'us-east-1';
const PREFIX = process.env.S3_TICKETS_PREFIX ?? 'tickets';
const KEY_ID = process.env.S3_COMPROBANTES_KEY_ID;
const SECRET = process.env.S3_COMPROBANTES_SECRET;

export function s3Disponible(): boolean {
  return Boolean(BUCKET && KEY_ID && SECRET);
}

let cliente: S3Client | null = null;
function getCliente(): S3Client {
  if (!cliente) {
    if (!s3Disponible()) throw new Error('S3 de tickets no configurado');
    cliente = new S3Client({
      region: REGION,
      credentials: { accessKeyId: KEY_ID!, secretAccessKey: SECRET! },
    });
  }
  return cliente;
}

/** `tickets/team_12/<uuid>.jpg` — el UUID hace la llave no adivinable. */
export function construirKeyTicket(teamId: number, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `${PREFIX}/team_${teamId}/${randomUUID()}.${ext}`;
}

export async function subirAdjuntoTicket(key: string, cuerpo: Buffer, mime: string): Promise<void> {
  await getCliente().send(new PutObjectCommand({
    Bucket: BUCKET!,
    Key: key,
    Body: cuerpo,
    ContentType: mime,
  }));
}

export async function leerAdjuntoTicket(key: string): Promise<Buffer> {
  const res = await getCliente().send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
  if (!res.Body) throw new Error('Objeto vacío en S3');
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function borrarAdjuntoTicket(key: string): Promise<void> {
  await getCliente().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
}
