/**
 * Archivos de las tareas por revisar (fotos, videos, documentos) — S3 privado,
 * el mismo bucket y las mismas credenciales que los comprobantes.
 *
 * Se sube por trozos A TRAVÉS DE LA APP, no con presigned PUT (la regla de
 * lib/storage/comprobantes.ts): cada trozo pasa por una ruta que valida sesión,
 * colegio y tarea. Los trozos son de 4 MB porque una función de Vercel no
 * recibe más de 4.5 MB por petición, y un video del celular pasa de eso.
 *
 * S3 no acepta partes de menos de 5 MB (salvo la última), así que un trozo
 * suelto se guarda aparte (`<key>.pend`) hasta que llega el siguiente, y los dos
 * juntos (8 MB) suben como una parte. Un archivo de un solo trozo sube entero,
 * sin multipart.
 *
 * Para VER se responde con una URL firmada de pocos minutos, como las fotos de
 * los alumnos (lib/fotos/storage.ts): un video necesita pedir rangos, y pasarlo
 * entero por una función no cabe. La URL solo la da la ruta después de
 * comprobar sesión, colegio y tarea.
 *
 * El usuario IAM de producción solo puede escribir bajo `prod/*`: el prefijo
 * cuelga del de comprobantes (`prod/tareas/…`).
 */

import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const BUCKET = process.env.S3_COMPROBANTES_BUCKET;
const REGION = process.env.S3_COMPROBANTES_REGION ?? 'us-east-1';
const PREFIX = process.env.S3_TAREAS_PREFIX ?? `${process.env.S3_COMPROBANTES_PREFIX ?? 'preview'}/tareas`;
const KEY_ID = process.env.S3_COMPROBANTES_KEY_ID;
const SECRET = process.env.S3_COMPROBANTES_SECRET;

/** Lo que manda el navegador en cada petición. Por debajo del tope de 4.5 MB de Vercel. */
export const TAMANO_TROZO = 4 * 1024 * 1024;
/** El mínimo de S3 para una parte que no es la última. */
const MINIMO_PARTE = 5 * 1024 * 1024;

export function s3Disponible(): boolean {
  return Boolean(BUCKET && KEY_ID && SECRET);
}

let cliente: S3Client | null = null;
function s3(): S3Client {
  if (!cliente) {
    if (!s3Disponible()) throw new Error('S3 de tareas no configurado');
    cliente = new S3Client({ region: REGION, credentials: { accessKeyId: KEY_ID!, secretAccessKey: SECRET! } });
  }
  return cliente;
}

/** `prod/tareas/team_12/<uuid>.mp4` — el UUID hace la llave no adivinable. */
export function construirKeyTarea(teamId: number, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `${PREFIX}/team_${teamId}/${randomUUID()}.${ext}`;
}

export interface EstadoSubida {
  key: string;
  mime: string;
  uploadId: string | null;
  partes: { PartNumber: number; ETag: string }[];
  pendiente: boolean;
}

const llavePendiente = (key: string) => `${key}.pend`;

async function leer(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
  if (!res.Body) throw new Error('Objeto vacío en S3');
  return Buffer.from(await res.Body.transformToByteArray());
}

/**
 * Recibe un trozo y devuelve el estado nuevo de la subida. Con `ultimo` la
 * cierra: el archivo queda entero en `key`.
 */
export async function recibirTrozo(e: EstadoSubida, trozo: Buffer, ultimo: boolean): Promise<EstadoSubida> {
  const sig = { ...e, partes: [...e.partes] };
  let cuerpo = trozo;
  if (e.pendiente) {
    cuerpo = Buffer.concat([await leer(llavePendiente(e.key)), trozo]);
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: llavePendiente(e.key) }));
    sig.pendiente = false;
  }

  if (ultimo && !sig.uploadId) {
    // Cupo en una sola parte (o en un trozo y su pareja): sube entero.
    await s3().send(new PutObjectCommand({ Bucket: BUCKET!, Key: e.key, Body: cuerpo, ContentType: e.mime }));
    return sig;
  }
  if (!ultimo && cuerpo.length < MINIMO_PARTE) {
    await s3().send(new PutObjectCommand({ Bucket: BUCKET!, Key: llavePendiente(e.key), Body: cuerpo }));
    sig.pendiente = true;
    return sig;
  }
  if (!sig.uploadId) {
    const r = await s3().send(new CreateMultipartUploadCommand({ Bucket: BUCKET!, Key: e.key, ContentType: e.mime }));
    if (!r.UploadId) throw new Error('S3 no abrió la subida');
    sig.uploadId = r.UploadId;
  }
  const numero = sig.partes.length + 1;
  const p = await s3().send(new UploadPartCommand({
    Bucket: BUCKET!, Key: e.key, UploadId: sig.uploadId, PartNumber: numero, Body: cuerpo,
  }));
  if (!p.ETag) throw new Error('S3 no confirmó la parte');
  sig.partes.push({ PartNumber: numero, ETag: p.ETag });
  if (ultimo) {
    await s3().send(new CompleteMultipartUploadCommand({
      Bucket: BUCKET!, Key: e.key, UploadId: sig.uploadId, MultipartUpload: { Parts: sig.partes },
    }));
  }
  return sig;
}

/** Cuánto pesa lo que quedó en S3, o null si no está. */
export async function tamanoEnS3(key: string): Promise<number | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return r.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function borrarArchivoTarea(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
}

/**
 * La URL para ver o bajar el archivo, de 5 minutos. Las fotos, los videos y
 * los PDF se abren en el navegador; lo demás se descarga con su nombre.
 */
export async function urlParaVer(key: string, nombre: string, mime: string, enLinea: boolean): Promise<string> {
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const limpio = nombre.replace(/["\\\r\n]/g, '_');
  return getSignedUrl(s3(), new GetObjectCommand({
    Bucket: BUCKET!, Key: key,
    ResponseContentType: mime,
    ResponseContentDisposition: `${enLinea ? 'inline' : 'attachment'}; filename="${limpio}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  }), { expiresIn: 300 });
}
