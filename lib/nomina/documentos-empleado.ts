/**
 * Documentos adjuntos de un empleado (verificación de antecedentes, cédula,
 * título…). Reaprovecha el andamiaje de archivos escolares/comprobantes:
 * `prepararArchivo` valida por magic bytes, sube a S3 (o cae a base64 en la
 * propia fila sin credenciales) y devuelve las columnas a escribir. Aquí solo
 * se decide el dueño (empleado) y se persiste.
 *
 * Las tres reglas de seguridad que NO se aflojan (heredadas del bucket de
 * comprobantes): nunca presigned URLs, el binario se sirve por una ruta que
 * valida sesión y empresa, y la llave lleva un UUID (no el id de la fila).
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleadoDocumentos } from '@/lib/db/schema';
import {
  prepararArchivo, borrarArchivoSiHay, DemasiadosArchivosError, ArchivoInvalidoError,
} from '@/lib/administracion-escolar/documentos-archivo';
import { leerComprobante } from '@/lib/storage/comprobantes';

export { ArchivoInvalidoError, DemasiadosArchivosError };

/** Tope de documentos por empleado: holgado, corta un bucle o un descuido. */
export const MAX_DOCUMENTOS_POR_EMPLEADO = 15;

/** Tipos aceptados en el catálogo simple (la UI ofrece estos). */
export const TIPOS_DOCUMENTO = ['antecedentes', 'cedula', 'titulo', 'otro'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export interface DocumentoResumen {
  id: number;
  tipo: string;
  archivoNombre: string | null;
  mime: string;
  tamanoBytes: number;
  subidoEn: string;
}

function aResumen(f: typeof empleadoDocumentos.$inferSelect): DocumentoResumen {
  return {
    id: f.id,
    tipo: f.tipo,
    archivoNombre: f.archivoNombre,
    mime: f.mime,
    tamanoBytes: f.tamanoBytes,
    subidoEn: f.createdAt.toISOString(),
  };
}

/** Los documentos de un empleado, más viejos primero. */
export async function listarDocumentos(teamId: number, empleadoId: number): Promise<DocumentoResumen[]> {
  const filas = await db
    .select()
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.teamId, teamId), eq(empleadoDocumentos.empleadoId, empleadoId)))
    .orderBy(asc(empleadoDocumentos.id));
  return filas.map(aResumen);
}

/** Cuenta por empleado (para el resumen del listado sin traer los binarios). */
export async function contarDocumentos(teamId: number, empleadoIds: number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (empleadoIds.length === 0) return mapa;
  const filas = await db
    .select({ empleadoId: empleadoDocumentos.empleadoId, n: sql<number>`COUNT(*)::int` })
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.teamId, teamId), inArray(empleadoDocumentos.empleadoId, empleadoIds)))
    .groupBy(empleadoDocumentos.empleadoId);
  for (const f of filas) mapa.set(f.empleadoId, f.n);
  return mapa;
}

/**
 * Sube un documento a un empleado. Acumula (no reemplaza). El mismo binario dos
 * veces no crea dos filas: el único (empleado, sha256) lo impide y devuelve el
 * que ya estaba.
 */
export async function agregarDocumento(input: {
  teamId: number;
  empleadoId: number;
  tipo: string;
  buffer: Buffer;
  nombreOriginal: string;
  subidoPor: number | null;
}): Promise<DocumentoResumen> {
  const [{ cuantos }] = await db
    .select({ cuantos: sql<number>`COUNT(*)::int` })
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.teamId, input.teamId), eq(empleadoDocumentos.empleadoId, input.empleadoId)));
  if (cuantos >= MAX_DOCUMENTOS_POR_EMPLEADO) {
    throw new DemasiadosArchivosError(
      `Este empleado ya tiene ${MAX_DOCUMENTOS_POR_EMPLEADO} documentos. Borra alguno antes de subir otro.`);
  }

  const guardado = await prepararArchivo(input.teamId, input.buffer, input.nombreOriginal);

  const [fila] = await db
    .insert(empleadoDocumentos)
    .values({
      teamId: input.teamId,
      empleadoId: input.empleadoId,
      tipo: input.tipo,
      archivoNombre: guardado.archivoNombre,
      mime: guardado.mime,
      tamanoBytes: guardado.tamanoBytes,
      sha256: guardado.sha256,
      storage: guardado.storage,
      s3Key: guardado.s3Key,
      contenido: guardado.contenido,
      subidoPor: input.subidoPor,
    })
    .onConflictDoNothing({ target: [empleadoDocumentos.empleadoId, empleadoDocumentos.sha256] })
    .returning();

  if (fila) return aResumen(fila);

  // Duplicado exacto: el objeto recién subido a S3 no lo referencia nadie.
  await borrarArchivoSiHay(guardado.storage, guardado.s3Key);
  const [existente] = await db
    .select()
    .from(empleadoDocumentos)
    .where(and(
      eq(empleadoDocumentos.empleadoId, input.empleadoId),
      eq(empleadoDocumentos.sha256, guardado.sha256),
    ))
    .limit(1);
  return aResumen(existente);
}

/** El binario de un documento, con su empresa ya comprobada. */
export async function leerDocumentoPorId(
  teamId: number, docId: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  const [fila] = await db
    .select()
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.id, docId), eq(empleadoDocumentos.teamId, teamId)))
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

/** Borra un documento (y su objeto en el bucket). */
export async function borrarDocumentoPorId(teamId: number, docId: number): Promise<boolean> {
  const [fila] = await db
    .delete(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.id, docId), eq(empleadoDocumentos.teamId, teamId)))
    .returning({ storage: empleadoDocumentos.storage, s3Key: empleadoDocumentos.s3Key });
  if (!fila) return false;
  await borrarArchivoSiHay(fila.storage, fila.s3Key);
  return true;
}
