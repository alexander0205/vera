import 'server-only';
import { createHash, randomUUID } from 'crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { capturaFacturasArchivos } from '@/lib/db/schema';
import { detectarTipo, ArchivoInvalidoError } from '@/lib/pagos/adjuntos';
import { s3Disponible, subirComprobante, leerComprobante } from '@/lib/storage/comprobantes';

/**
 * Las fotos de una factura capturada. Mismo andamiaje que los comprobantes de
 * pago y los documentos de matrícula —bucket privado, tipo por magic bytes,
 * llave con UUID, nunca presigned URLs— con su propio prefijo en el bucket.
 * Sin credenciales de S3 (desarrollo) el binario va a Postgres en base64.
 */

export { ArchivoInvalidoError };

/** El teléfono comprime antes de subir; esto es el techo para un PDF. */
export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
/** Una factura larga ocupa varias fotos; más de cuatro es otra factura. */
export const MAX_ARCHIVOS = 4;

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export async function guardarArchivo(input: {
  teamId: number; capturaId: number; buffer: Buffer; orden: number;
}): Promise<{ id: number; mime: string }> {
  if (input.buffer.length > MAX_BYTES_ARCHIVO) {
    throw new ArchivoInvalidoError(`Un archivo pesa más de ${MAX_BYTES_ARCHIVO / 1024 / 1024} MB.`);
  }
  const tipo = detectarTipo(input.buffer);
  const base = {
    teamId: input.teamId, capturaId: input.capturaId, orden: input.orden, mime: tipo.mime,
    tamanoBytes: input.buffer.length, sha256: sha256(input.buffer),
  };
  let valores: typeof capturaFacturasArchivos.$inferInsert;
  if (s3Disponible()) {
    const prefijo = process.env.S3_COMPROBANTES_PREFIX ?? 'preview';
    const key = `${prefijo}/team_${input.teamId}/factura-proveedor/${randomUUID()}.${tipo.ext}`;
    await subirComprobante(key, input.buffer, tipo.mime);
    valores = { ...base, storage: 's3', s3Key: key, contenido: null };
  } else {
    valores = { ...base, storage: 'db', s3Key: null, contenido: input.buffer.toString('base64') };
  }
  const [fila] = await db.insert(capturaFacturasArchivos).values(valores)
    .returning({ id: capturaFacturasArchivos.id, mime: capturaFacturasArchivos.mime });
  return fila;
}

export async function listarArchivos(teamId: number, capturaId: number) {
  return db
    .select({ id: capturaFacturasArchivos.id, mime: capturaFacturasArchivos.mime, orden: capturaFacturasArchivos.orden })
    .from(capturaFacturasArchivos)
    .where(and(eq(capturaFacturasArchivos.teamId, teamId), eq(capturaFacturasArchivos.capturaId, capturaId)))
    .orderBy(asc(capturaFacturasArchivos.orden), asc(capturaFacturasArchivos.id));
}

/** El binario de un archivo, comprobando que es de esa empresa. */
export async function leerArchivo(teamId: number, archivoId: number): Promise<{ buffer: Buffer; mime: string } | null> {
  const [fila] = await db
    .select()
    .from(capturaFacturasArchivos)
    .where(and(eq(capturaFacturasArchivos.id, archivoId), eq(capturaFacturasArchivos.teamId, teamId)))
    .limit(1);
  if (!fila) return null;
  if (fila.storage === 'db') return fila.contenido ? { buffer: Buffer.from(fila.contenido, 'base64'), mime: fila.mime } : null;
  if (!fila.s3Key) return null;
  return { buffer: await leerComprobante(fila.s3Key), mime: fila.mime };
}

/** Los binarios de una captura, en orden, para leerlos (QR o IA). */
export async function leerArchivosDeCaptura(teamId: number, capturaId: number) {
  const lista = await listarArchivos(teamId, capturaId);
  const salida: { id: number; mime: string; buffer: Buffer }[] = [];
  for (const a of lista) {
    const leido = await leerArchivo(teamId, a.id);
    if (leido) salida.push({ id: a.id, mime: leido.mime, buffer: leido.buffer });
  }
  return salida;
}
