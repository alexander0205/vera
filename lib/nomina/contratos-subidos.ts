/**
 * Contrato firmado SUBIDO (camino offline).
 *
 * La empresa imprime el contrato, lo firma a mano y sube el escaneo. Se archiva
 * una fila de `nomina_contratos` con `origen='subido'` y `estado='firmado'`; el
 * binario reaprovecha el andamiaje de comprobantes/archivos (S3 privado o base64
 * en la propia fila). No hay flujo de firma: nace firmado.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaContratos } from '@/lib/db/schema';
import { prepararArchivo, borrarArchivoSiHay } from '@/lib/administracion-escolar/documentos-archivo';
import { leerComprobante } from '@/lib/storage/comprobantes';

export interface ContratoSubidoInput {
  teamId: number;
  empleadoId: number;
  titulo: string;
  buffer: Buffer;
  nombreOriginal: string;
  userId: number | null;
}

/**
 * Borra TODOS los contratos de un empleado (y los archivos en S3 de los
 * subidos). Se usa para el reemplazo: un empleado tiene un solo contrato, así
 * que generar o subir uno nuevo elimina el anterior. Devuelve cuántos borró.
 */
export async function borrarContratosDeEmpleado(teamId: number, empleadoId: number): Promise<number> {
  const filas = await db
    .delete(nominaContratos)
    .where(and(eq(nominaContratos.teamId, teamId), eq(nominaContratos.empleadoId, empleadoId)))
    .returning({ storage: nominaContratos.archivoStorage, s3Key: nominaContratos.archivoS3Key });
  for (const f of filas) await borrarArchivoSiHay(f.storage, f.s3Key);
  return filas.length;
}

/** Archiva el contrato firmado y devuelve el id de la fila creada. */
export async function subirContratoFirmado(input: ContratoSubidoInput): Promise<{ id: number; titulo: string }> {
  const guardado = await prepararArchivo(input.teamId, input.buffer, input.nombreOriginal);
  const titulo = (input.titulo || guardado.archivoNombre || 'Contrato firmado').trim().slice(0, 200);

  // Un empleado tiene un solo contrato: el subido reemplaza cualquier anterior.
  await borrarContratosDeEmpleado(input.teamId, input.empleadoId);

  const [fila] = await db
    .insert(nominaContratos)
    .values({
      teamId: input.teamId,
      empleadoId: input.empleadoId,
      plantillaId: null,
      titulo,
      cuerpo: null,
      estado: 'firmado',
      origen: 'subido',
      archivoNombre: guardado.archivoNombre,
      archivoMime: guardado.mime,
      archivoTamanoBytes: guardado.tamanoBytes,
      archivoSha256: guardado.sha256,
      archivoStorage: guardado.storage,
      archivoS3Key: guardado.s3Key,
      archivoContenido: guardado.contenido,
      createdBy: input.userId,
    })
    .returning({ id: nominaContratos.id });

  return { id: fila.id, titulo };
}

/**
 * El binario de un contrato SUBIDO, con su empresa ya comprobada. Devuelve null
 * si el contrato no existe, no es de esta empresa, o es de plataforma (ese se
 * genera como PDF, no se sirve de archivo).
 */
export async function leerArchivoContrato(
  teamId: number, contratoId: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  const [fila] = await db
    .select()
    .from(nominaContratos)
    .where(and(eq(nominaContratos.id, contratoId), eq(nominaContratos.teamId, teamId)))
    .limit(1);
  if (!fila || fila.origen !== 'subido') return null;

  const nombre = fila.archivoNombre ?? 'contrato';
  const mime = fila.archivoMime ?? 'application/octet-stream';
  if (fila.archivoStorage === 'db') {
    if (!fila.archivoContenido) return null;
    return { buffer: Buffer.from(fila.archivoContenido, 'base64'), mime, nombre };
  }
  if (!fila.archivoS3Key) return null;
  return { buffer: await leerComprobante(fila.archivoS3Key), mime, nombre };
}
