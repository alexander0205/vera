import { createHash } from 'crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentoArchivos, adminEscolarDocumentosEntregados } from '@/lib/db/schema';
import { detectarTipo, ArchivoInvalidoError } from '@/lib/pagos/adjuntos';
import {
  s3Disponible, subirComprobante, leerComprobante, borrarComprobante,
} from '@/lib/storage/comprobantes';
import { randomUUID } from 'crypto';

/**
 * El binario de un documento de matrícula.
 *
 * Reaprovecha entero el andamiaje de los comprobantes de pago —mismo bucket
 * privado, mismo cliente S3, misma detección de tipo por magic bytes— porque
 * las reglas de seguridad son las mismas y duplicarlas es la forma de que una
 * de las dos copias se afloje sin que nadie lo note. Lo único propio es el
 * prefijo de la llave, para poder distinguirlos en el bucket.
 *
 * De ahí heredan las tres decisiones que NO deben aflojarse:
 *  · nunca presigned URLs (ni de lectura ni de escritura);
 *  · el binario se sirve por una ruta que valida sesión y empresa;
 *  · la llave lleva un UUID, nunca el id de la fila, para que no se enumere.
 */

export { ArchivoInvalidoError };

/** Un expediente escaneado pesa más que un comprobante de pago: 8 MB. */
export const MAX_BYTES_DOCUMENTO = 8 * 1024 * 1024;

/** `prod/team_12/documento/<uuid>.pdf` */
function construirKeyDocumento(teamId: number, extension: string): string {
  const prefijo = process.env.S3_COMPROBANTES_PREFIX ?? 'preview';
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `${prefijo}/team_${teamId}/documento/${randomUUID()}.${ext}`;
}

export interface ArchivoGuardado {
  archivoNombre: string;
  mime: string;
  tamanoBytes: number;
  sha256: string;
  storage: 's3' | 'db';
  s3Key: string | null;
  contenido: string | null;
}

/**
 * Valida y sube el binario. Devuelve las columnas a escribir, sin tocar la
 * base: quién es el dueño de la fila lo decide el llamador dentro de su
 * transacción.
 */
export async function prepararArchivo(
  teamId: number, buffer: Buffer, nombreOriginal: string,
): Promise<ArchivoGuardado> {
  if (buffer.length > MAX_BYTES_DOCUMENTO) {
    throw new ArchivoInvalidoError(
      `El archivo pesa más de ${Math.round(MAX_BYTES_DOCUMENTO / 1024 / 1024)} MB.`);
  }
  // Por magic bytes, no por el mime que manda el navegador: el `Content-Type`
  // de un multipart lo escribe quien sube.
  const tipo = detectarTipo(buffer);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const nombre = (nombreOriginal || `documento.${tipo.ext}`).slice(0, 255);

  // Sin credenciales (desarrollo local) el binario va a Postgres en base64. Es
  // el mismo escape que usan los comprobantes; así la pantalla se puede probar
  // sin montar un bucket.
  if (!s3Disponible()) {
    return {
      archivoNombre: nombre, mime: tipo.mime, tamanoBytes: buffer.length, sha256,
      storage: 'db', s3Key: null, contenido: buffer.toString('base64'),
    };
  }

  const key = construirKeyDocumento(teamId, tipo.ext);
  await subirComprobante(key, buffer, tipo.mime);
  return {
    archivoNombre: nombre, mime: tipo.mime, tamanoBytes: buffer.length, sha256,
    storage: 's3', s3Key: key, contenido: null,
  };
}

/** Tope de archivos por documento. Un acta tiene dos caras y una tarjeta de
 *  vacunas varias páginas; diez es holgado y corta un bucle o un descuido. */
export const MAX_ARCHIVOS_POR_DOCUMENTO = 10;

export class DemasiadosArchivosError extends Error {}

export interface ArchivoResumen {
  id: number;
  archivoNombre: string | null;
  mime: string;
  tamanoBytes: number;
  orden: number;
  subidoEn: string;
  subidoFamilia: boolean;
}

/**
 * Añade un archivo a un documento ya entregado. No reemplaza: acumula.
 *
 * El mismo binario dos veces no crea dos filas —el índice único por
 * (entregado, sha256) lo impide— y se devuelve el que ya estaba. Es el caso del
 * padre que toca "subir" dos veces con mala cobertura y no sabe si llegó.
 */
export async function agregarArchivo(input: {
  teamId: number;
  entregadoId: number;
  buffer: Buffer;
  nombreOriginal: string;
  subidoPor: number | null;
  subidoFamilia: boolean;
}): Promise<ArchivoResumen> {
  const [{ cuantos }] = await db
    .select({ cuantos: sql<number>`COUNT(*)::int` })
    .from(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.teamId, input.teamId),
      eq(adminEscolarDocumentoArchivos.entregadoId, input.entregadoId),
    ));
  if (cuantos >= MAX_ARCHIVOS_POR_DOCUMENTO) {
    throw new DemasiadosArchivosError(
      `Este documento ya tiene ${MAX_ARCHIVOS_POR_DOCUMENTO} archivos. Borra alguno antes de subir otro.`);
  }

  const guardado = await prepararArchivo(input.teamId, input.buffer, input.nombreOriginal);

  const [fila] = await db
    .insert(adminEscolarDocumentoArchivos)
    .values({
      teamId: input.teamId,
      entregadoId: input.entregadoId,
      archivoNombre: guardado.archivoNombre,
      mime: guardado.mime,
      tamanoBytes: guardado.tamanoBytes,
      sha256: guardado.sha256,
      storage: guardado.storage,
      s3Key: guardado.s3Key,
      contenido: guardado.contenido,
      orden: cuantos,
      subidoEn: new Date(),
      subidoPor: input.subidoPor,
      subidoFamilia: input.subidoFamilia,
    })
    .onConflictDoNothing({
      target: [adminEscolarDocumentoArchivos.entregadoId, adminEscolarDocumentoArchivos.sha256],
    })
    .returning();

  if (fila) return aResumen(fila);

  // Duplicado exacto: el objeto que se acaba de subir a S3 no lo referencia
  // nadie, así que se limpia y se devuelve el que ya estaba.
  await borrarArchivoSiHay(guardado.storage, guardado.s3Key);
  const [existente] = await db
    .select()
    .from(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.entregadoId, input.entregadoId),
      eq(adminEscolarDocumentoArchivos.sha256, guardado.sha256),
    ))
    .limit(1);
  return aResumen(existente);
}

function aResumen(f: typeof adminEscolarDocumentoArchivos.$inferSelect): ArchivoResumen {
  return {
    id: f.id,
    archivoNombre: f.archivoNombre,
    mime: f.mime,
    tamanoBytes: f.tamanoBytes,
    orden: f.orden,
    subidoEn: f.subidoEn.toISOString(),
    subidoFamilia: f.subidoFamilia,
  };
}

export async function listarArchivos(teamId: number, entregadoIds: number[]) {
  if (entregadoIds.length === 0) return new Map<number, ArchivoResumen[]>();
  const filas = await db
    .select()
    .from(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.teamId, teamId),
      inArray(adminEscolarDocumentoArchivos.entregadoId, entregadoIds),
    ))
    .orderBy(asc(adminEscolarDocumentoArchivos.orden), asc(adminEscolarDocumentoArchivos.id));

  const mapa = new Map<number, ArchivoResumen[]>();
  for (const f of filas) {
    const lista = mapa.get(f.entregadoId) ?? [];
    lista.push(aResumen(f));
    mapa.set(f.entregadoId, lista);
  }
  return mapa;
}

/** El binario de UN archivo, con su documento y matrícula ya comprobados. */
export async function leerArchivoPorId(
  teamId: number, archivoId: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  const [fila] = await db
    .select()
    .from(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.id, archivoId),
      eq(adminEscolarDocumentoArchivos.teamId, teamId),
    ))
    .limit(1);
  if (!fila) return null;

  const nombre = fila.archivoNombre ?? 'documento';
  if (fila.storage === 'db') {
    if (!fila.contenido) return null;
    return { buffer: Buffer.from(fila.contenido, 'base64'), mime: fila.mime, nombre };
  }
  if (!fila.s3Key) return null;
  return { buffer: await leerComprobante(fila.s3Key), mime: fila.mime, nombre };
}

/** Borra un archivo suelto (y su objeto en el bucket). */
export async function borrarArchivoPorId(teamId: number, archivoId: number): Promise<boolean> {
  const [fila] = await db
    .delete(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.id, archivoId),
      eq(adminEscolarDocumentoArchivos.teamId, teamId),
    ))
    .returning({ storage: adminEscolarDocumentoArchivos.storage, s3Key: adminEscolarDocumentoArchivos.s3Key });
  if (!fila) return false;
  await borrarArchivoSiHay(fila.storage, fila.s3Key);
  return true;
}

/** Vacía un documento: se usa al marcarlo "no aplica". */
export async function borrarArchivosDeEntregado(teamId: number, entregadoId: number): Promise<void> {
  const filas = await db
    .delete(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.teamId, teamId),
      eq(adminEscolarDocumentoArchivos.entregadoId, entregadoId),
    ))
    .returning({ storage: adminEscolarDocumentoArchivos.storage, s3Key: adminEscolarDocumentoArchivos.s3Key });
  for (const f of filas) await borrarArchivoSiHay(f.storage, f.s3Key);
}

/** El binario de una fila ya guardada, venga de S3 o de la propia base. */
export async function leerArchivo(
  teamId: number, entregadoId: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  const [fila] = await db
    .select({
      storage: adminEscolarDocumentosEntregados.storage,
      s3Key: adminEscolarDocumentosEntregados.s3Key,
      contenido: adminEscolarDocumentosEntregados.contenido,
      mime: adminEscolarDocumentosEntregados.mime,
      nombre: adminEscolarDocumentosEntregados.archivoNombre,
    })
    .from(adminEscolarDocumentosEntregados)
    .where(and(
      eq(adminEscolarDocumentosEntregados.id, entregadoId),
      eq(adminEscolarDocumentosEntregados.teamId, teamId),
    ))
    .limit(1);

  if (!fila || !fila.storage) return null;
  const mime = fila.mime ?? 'application/octet-stream';
  const nombre = fila.nombre ?? 'documento';

  if (fila.storage === 'db') {
    if (!fila.contenido) return null;
    return { buffer: Buffer.from(fila.contenido, 'base64'), mime, nombre };
  }
  if (!fila.s3Key) return null;
  return { buffer: await leerComprobante(fila.s3Key), mime, nombre };
}

/**
 * Borra el binario anterior al reemplazarlo. Se traga el fallo a propósito: si
 * S3 no responde, el archivo nuevo ya está guardado y lo que queda es un objeto
 * huérfano en el bucket. Abortar la sustitución por eso sería peor.
 */
export async function borrarArchivoSiHay(
  storage: string | null, s3Key: string | null,
): Promise<void> {
  if (storage !== 's3' || !s3Key) return;
  try {
    await borrarComprobante(s3Key);
  } catch {
    // Huérfano en el bucket; la fila ya apunta al archivo nuevo.
  }
}
