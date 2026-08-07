/**
 * Comprobantes de pago — validación y persistencia.
 *
 * El tipo del archivo se decide por sus magic bytes, NO por el `mime` que manda
 * el cliente ni por la extensión del nombre: ambos los controla quien sube. Un
 * SVG o un HTML servidos con el Content-Type equivocado ejecutan script en el
 * origen de la app, así que la lista blanca es cerrada — jpeg, png, webp, pdf.
 */

import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@/lib/db/drizzle';
import { pagoAdjuntos, teams } from '@/lib/db/schema';
import sharp from 'sharp';
import {
  s3Disponible, construirKey, construirThumbKey,
  subirComprobante, leerComprobante, borrarComprobante,
} from '@/lib/storage/comprobantes';

/** Tope por archivo. El límite duro real es el body de 4.5 MB de las funciones
 *  de Vercel; el cliente ya recomprime las imágenes muy por debajo de esto. */
export const MAX_BYTES = 3 * 1024 * 1024;
/** Tope por pago. Evita que una sola operación llene la pantalla y el bucket. */
export const MAX_POR_PAGO = 5;

/** Espacio de nombres del lock consultivo, para no chocar con otro que use el
 *  mismo id de documento como llave. Arbitrario pero fijo. */
const LOCK_NAMESPACE_ADJUNTOS = 8421;

interface TipoPermitido { mime: string; ext: string; magic: (b: Buffer) => boolean }

const TIPOS: TipoPermitido[] = [
  { mime: 'image/jpeg', ext: 'jpg',  magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png',  ext: 'png',  magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', magic: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', magic: b => b.subarray(0, 5).toString('ascii') === '%PDF-' },
];

export class ArchivoInvalidoError extends Error {}

/** Detecta el tipo real. Lanza si no está en la lista blanca. */
export function detectarTipo(buffer: Buffer): TipoPermitido {
  if (buffer.length < 12) throw new ArchivoInvalidoError('El archivo está vacío o dañado.');
  const tipo = TIPOS.find(t => t.magic(buffer));
  if (!tipo) {
    throw new ArchivoInvalidoError('Formato no admitido. Sube una imagen (JPG, PNG, WEBP) o un PDF.');
  }
  return tipo;
}

/** Quita rutas y caracteres de control del nombre que manda el cliente. */
function limpiarNombre(nombre: string, ext: string): string {
  const base = (nombre.split(/[\\/]/).pop() ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim()
    .slice(0, 200);
  return base || `comprobante.${ext}`;
}

export interface AdjuntoMeta {
  id:           number;
  nombre:       string;
  mime:         string;
  tamanoBytes:  number;
  createdAt:    Date;
  subidoPor:    number | null;
  /** false en PDF: no hay miniatura, la UI pinta un ícono. */
  tieneThumb:   boolean;
}

/** Lado mayor de la miniatura. 300px cubre el thumb de 70px a 2x y el hover. */
const THUMB_LADO = 300;

/**
 * Miniatura JPEG a partir del binario que se va a guardar (no de lo que mande
 * el cliente): lo que se ve en la galería siempre deriva del archivo real.
 * Devuelve null en PDF o si la imagen no se puede decodificar — en ese caso la
 * UI cae al ícono, que no es un error.
 */
async function generarThumb(buffer: Buffer, mime: string): Promise<Buffer | null> {
  if (mime === 'application/pdf') return null;
  try {
    return await sharp(buffer)
      .rotate()                       // respeta la orientación EXIF antes de perderla
      .resize(THUMB_LADO, THUMB_LADO, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Reescribe la imagen sin metadatos. Las fotos de comprobante salen del celular
 * con EXIF que incluye GPS: la casa del cliente quedaría guardada junto al
 * recibo. sharp por defecto no copia metadata, así que reencodear la borra.
 * Los píxeles quedan intactos. PDF pasa sin tocar.
 */
async function limpiarMetadatos(buffer: Buffer, mime: string): Promise<Buffer> {
  if (mime === 'application/pdf') return buffer;
  try {
    const img = sharp(buffer).rotate();
    const limpio = mime === 'image/png'  ? await img.png().toBuffer()
                 : mime === 'image/webp' ? await img.webp().toBuffer()
                 : await img.jpeg({ quality: 90 }).toBuffer();
    // Si reencodear engordó el archivo, quedarse con el original.
    return limpio.length < buffer.length ? limpio : buffer;
  } catch {
    return buffer;
  }
}

/**
 * Guarda un comprobante. Va a S3 si hay credenciales; si no (desarrollo local),
 * cae a base64 en Postgres. El llamador ya validó permiso y pertenencia del doc.
 */
export async function guardarAdjunto(input: {
  teamId:          number;
  ecfDocumentId:   number;
  pagoRecibidoId?: number | null;
  nombre:          string;
  buffer:          Buffer;
  subidoPor:       number;
}): Promise<AdjuntoMeta> {
  if (input.buffer.length > MAX_BYTES) {
    throw new ArchivoInvalidoError(
      `El archivo pesa ${(input.buffer.length / 1024 / 1024).toFixed(1)} MB. El máximo es 3 MB.`,
    );
  }
  // El tipo se detecta sobre lo que llegó; recién después se reescribe.
  const tipo   = detectarTipo(input.buffer);
  const nombre = limpiarNombre(input.nombre, tipo.ext);

  const buffer = await limpiarMetadatos(input.buffer, tipo.mime);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  // Mismo archivo ya subido a esta factura → devolver el existente en vez de
  // duplicar el objeto en S3. Pasa seguido: una transferencia paga varias cuotas.
  // Este atajo evita el trabajo pesado; la garantía real es el índice único.
  const [duplicado] = await db
    .select()
    .from(pagoAdjuntos)
    .where(and(
      eq(pagoAdjuntos.teamId, input.teamId),
      eq(pagoAdjuntos.ecfDocumentId, input.ecfDocumentId),
      eq(pagoAdjuntos.sha256, sha256),
    ))
    .limit(1);
  if (duplicado) return aMeta(duplicado);

  if (await contarAdjuntos(input.teamId, input.ecfDocumentId) >= MAX_POR_PAGO) {
    throw new ArchivoInvalidoError(`Ya hay ${MAX_POR_PAGO} comprobantes en esta factura.`);
  }

  const thumb = await generarThumb(buffer, tipo.mime);

  let storage = 'db';
  let s3Key: string | null = null;
  let thumbS3Key: string | null = null;
  let contenido: string | null = null;

  if (s3Disponible()) {
    s3Key   = construirKey(input.teamId, tipo.ext);
    storage = 's3';
    await subirComprobante(s3Key, buffer, tipo.mime);
    if (thumb) {
      thumbS3Key = construirThumbKey(s3Key);
      // Si falla solo la miniatura, el comprobante igual queda subido: la
      // galería cae al ícono en vez de perderse el archivo.
      await subirComprobante(thumbS3Key, thumb, 'image/jpeg')
        .catch(() => { thumbS3Key = null; });
    }
  } else {
    contenido = buffer.toString('base64');
  }

  try {
    // El conteo y el insert van en una transacción serializada por documento:
    // sin eso, N subidas simultáneas leen "0 de 5" a la vez y todas pasan el
    // tope. Se usa un lock consultivo y no `SELECT ... FOR UPDATE` sobre
    // ecf_documents, que bloquearía a syncPagoMirror registrando un cobro de
    // esa misma factura. Se toma DESPUÉS de subir a S3 para no tenerlo abierto
    // durante la red, y se suelta solo al cerrar la transacción.
    const fila = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE_ADJUNTOS}, ${input.ecfDocumentId})`);

      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(pagoAdjuntos)
        .where(and(
          eq(pagoAdjuntos.teamId, input.teamId),
          eq(pagoAdjuntos.ecfDocumentId, input.ecfDocumentId),
        ));
      if (Number(n) >= MAX_POR_PAGO) {
        throw new ArchivoInvalidoError(`Ya hay ${MAX_POR_PAGO} comprobantes en esta factura.`);
      }

      const [creada] = await tx.insert(pagoAdjuntos).values({
        teamId:         input.teamId,
        ecfDocumentId:  input.ecfDocumentId,
        pagoRecibidoId: input.pagoRecibidoId ?? null,
        nombre,
        mime:           tipo.mime,
        tamanoBytes:    buffer.length,
        sha256,
        storage,
        s3Key,
        thumbS3Key,
        contenido,
        subidoPor:      input.subidoPor,
      })
        // El índice único (team, doc, sha256) decide quién gana cuando dos
        // subidas del mismo archivo llegan a la vez.
        .onConflictDoNothing({ target: [pagoAdjuntos.teamId, pagoAdjuntos.ecfDocumentId, pagoAdjuntos.sha256] })
        .returning();
      return creada;
    });

    if (!fila) {
      // Perdimos la carrera: otra request ya guardó este mismo archivo. Se
      // devuelve el suyo y se borran los objetos que subimos, que quedaron sin
      // fila que los apunte.
      if (s3Key)      await borrarComprobante(s3Key).catch(() => {});
      if (thumbS3Key) await borrarComprobante(thumbS3Key).catch(() => {});
      const [ganador] = await db
        .select()
        .from(pagoAdjuntos)
        .where(and(
          eq(pagoAdjuntos.teamId, input.teamId),
          eq(pagoAdjuntos.ecfDocumentId, input.ecfDocumentId),
          eq(pagoAdjuntos.sha256, sha256),
        ))
        .limit(1);
      if (!ganador) throw new Error('No se pudo guardar el comprobante');
      return aMeta(ganador);
    }
    return aMeta(fila);
  } catch (e) {
    // Los objetos ya están en S3 pero la fila no entró: sin fila nadie puede
    // llegar a ellos nunca más, así que se borran en el momento en vez de dejar
    // basura que solo un job de reconciliación encontraría.
    if (s3Key)      await borrarComprobante(s3Key).catch(() => {});
    if (thumbS3Key) await borrarComprobante(thumbS3Key).catch(() => {});
    throw e;
  }
}

function aMeta(f: typeof pagoAdjuntos.$inferSelect): AdjuntoMeta {
  return {
    id: f.id, nombre: f.nombre, mime: f.mime,
    tamanoBytes: f.tamanoBytes, createdAt: f.createdAt, subidoPor: f.subidoPor,
    tieneThumb: Boolean(f.thumbS3Key) || (f.storage === 'db' && f.mime !== 'application/pdf'),
  };
}

export async function contarAdjuntos(teamId: number, ecfDocumentId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pagoAdjuntos)
    .where(and(eq(pagoAdjuntos.teamId, teamId), eq(pagoAdjuntos.ecfDocumentId, ecfDocumentId)));
  return Number(r?.n ?? 0);
}

/** Metadata de los comprobantes de una factura. Nunca trae el binario. */
export async function listarAdjuntos(teamId: number, ecfDocumentId: number): Promise<AdjuntoMeta[]> {
  const filas = await db
    .select({
      id: pagoAdjuntos.id, nombre: pagoAdjuntos.nombre, mime: pagoAdjuntos.mime,
      tamanoBytes: pagoAdjuntos.tamanoBytes, createdAt: pagoAdjuntos.createdAt,
      subidoPor: pagoAdjuntos.subidoPor,
      thumbS3Key: pagoAdjuntos.thumbS3Key, storage: pagoAdjuntos.storage,
    })
    .from(pagoAdjuntos)
    .where(and(eq(pagoAdjuntos.teamId, teamId), eq(pagoAdjuntos.ecfDocumentId, ecfDocumentId)))
    .orderBy(desc(pagoAdjuntos.id));

  return filas.map(f => ({
    id: f.id, nombre: f.nombre, mime: f.mime, tamanoBytes: f.tamanoBytes,
    createdAt: f.createdAt, subidoPor: f.subidoPor,
    tieneThumb: Boolean(f.thumbS3Key) || (f.storage === 'db' && f.mime !== 'application/pdf'),
  }));
}

/**
 * Trae el binario. El filtro por teamId es lo único que separa los comprobantes
 * de una empresa de los de otra — no quitarlo.
 */
export interface AdjuntoCabecera {
  etag:   string;
  nombre: string;
  mime:   string;
}

/**
 * Solo lo necesario para decidir un 304, sin bajar el binario. Se resuelve con
 * una query a Postgres; si el navegador ya tiene la copia no se toca S3.
 */
export async function leerCabeceraAdjunto(
  teamId: number,
  id: number,
  variante: 'full' | 'thumb' = 'full',
): Promise<AdjuntoCabecera | null> {
  const [f] = await db
    .select({
      sha256: pagoAdjuntos.sha256, nombre: pagoAdjuntos.nombre,
      mime: pagoAdjuntos.mime, thumbS3Key: pagoAdjuntos.thumbS3Key,
    })
    .from(pagoAdjuntos)
    .where(and(eq(pagoAdjuntos.id, id), eq(pagoAdjuntos.teamId, teamId)))
    .limit(1);
  if (!f) return null;

  const esThumb = variante === 'thumb' && Boolean(f.thumbS3Key);
  return {
    // ETag distinto por variante: si no, el navegador se queda con la miniatura
    // cacheada y la sirve como si fuera el original.
    etag:   `"${f.sha256}${esThumb ? '-t' : ''}"`,
    nombre: f.nombre,
    mime:   esThumb ? 'image/jpeg' : f.mime,
  };
}

export async function leerAdjunto(
  teamId: number,
  id: number,
  variante: 'full' | 'thumb' = 'full',
): Promise<{ buffer: Buffer; nombre: string; mime: string; etag: string } | null> {
  const [f] = await db
    .select()
    .from(pagoAdjuntos)
    .where(and(eq(pagoAdjuntos.id, id), eq(pagoAdjuntos.teamId, teamId)))
    .limit(1);
  if (!f) return null;

  const esThumb = variante === 'thumb' && Boolean(f.thumbS3Key);
  const etag = `"${f.sha256}${esThumb ? '-t' : ''}"`;

  if (esThumb) {
    return { buffer: await leerComprobante(f.thumbS3Key!), nombre: f.nombre, mime: 'image/jpeg', etag };
  }

  const buffer = f.storage === 's3' && f.s3Key
    ? await leerComprobante(f.s3Key)
    : Buffer.from(f.contenido ?? '', 'base64');

  return { buffer, nombre: f.nombre, mime: f.mime, etag };
}

/**
 * Ata comprobantes ya subidos a la fila de pago recién creada.
 *
 * El flujo es: el cliente sube los archivos primero (quedan colgando del
 * documento con pagoRecibidoId null) y después registra el pago mandando sus
 * ids. Así el servidor puede exigir el comprobante ANTES de crear el cobro, en
 * vez de descubrir que falta cuando ya entró la plata.
 *
 * Devuelve cuántos se ataron; ignora ids de otra empresa u otra factura.
 */
export async function vincularAdjuntos(
  teamId: number,
  ecfDocumentId: number,
  adjuntoIds: number[],
  pagoRecibidoId: number,
): Promise<number> {
  if (adjuntoIds.length === 0) return 0;
  const filas = await db
    .update(pagoAdjuntos)
    .set({ pagoRecibidoId })
    .where(and(
      eq(pagoAdjuntos.teamId, teamId),
      eq(pagoAdjuntos.ecfDocumentId, ecfDocumentId),
      inArray(pagoAdjuntos.id, adjuntoIds),
    ))
    .returning({ id: pagoAdjuntos.id });
  return filas.length;
}

/**
 * ¿Este cobro necesita comprobante y no lo tiene?
 *
 * Devuelve el método que lo exige, o null si puede pasar. Vive acá y no en cada
 * ruta porque el cobro entra por varias puertas y la regla tiene que ser la
 * misma en todas: si solo la valida una, se salta usando otra.
 *
 * NO aplica al POS ni al cobro que ocurre al emitir: una venta de mostrador se
 * cobra en dos segundos y exigir un archivo ahí traba la caja. La regla es para
 * el registro manual de cobros (Cuentas por cobrar y el detalle de la factura).
 */
export async function faltaComprobanteExigido(
  teamId: number,
  ecfDocumentId: number,
  metodos: string[],
  adjuntoIds: number[] = [],
): Promise<string | null> {
  const [cfg] = await db
    .select({ exige: teams.metodosExigeComprobante })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const exige = new Set(
    ((cfg?.exige as string[] | null) ?? []).map(m => m.trim().toLowerCase()),
  );
  if (exige.size === 0) return null;

  const metodoExigido = metodos.map(m => m.trim().toLowerCase()).find(m => exige.has(m));
  if (!metodoExigido) return null;

  // Sirve cualquier comprobante ya colgado de la factura, no solo los que vengan
  // en esta petición: el detalle reescribe el pago entero y sus adjuntos quedan
  // sueltos, y volver a pedirlos sería pedir subir dos veces lo mismo.
  const propios = await contarAdjuntosValidos(teamId, ecfDocumentId, adjuntoIds);
  if (propios > 0) return null;
  const yaEnLaFactura = await contarAdjuntos(teamId, ecfDocumentId);
  return yaEnLaFactura > 0 ? null : metodoExigido;
}

/** Cuenta cuáles de esos ids son comprobantes válidos de esta factura. */
export async function contarAdjuntosValidos(
  teamId: number,
  ecfDocumentId: number,
  adjuntoIds: number[],
): Promise<number> {
  if (adjuntoIds.length === 0) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pagoAdjuntos)
    .where(and(
      eq(pagoAdjuntos.teamId, teamId),
      eq(pagoAdjuntos.ecfDocumentId, ecfDocumentId),
      inArray(pagoAdjuntos.id, adjuntoIds),
    ));
  return Number(r?.n ?? 0);
}

/** Borra fila y objeto. Devuelve false si el adjunto no es de este team. */
export async function eliminarAdjunto(teamId: number, id: number): Promise<boolean> {
  const [f] = await db
    .select()
    .from(pagoAdjuntos)
    .where(and(eq(pagoAdjuntos.id, id), eq(pagoAdjuntos.teamId, teamId)))
    .limit(1);
  if (!f) return false;

  await db.delete(pagoAdjuntos).where(eq(pagoAdjuntos.id, id));
  // Primero la fila, después los objetos: si el borrado en S3 falla queda un
  // objeto huérfano (invisible y barato), no un adjunto roto en la UI.
  if (f.storage === 's3') {
    if (f.s3Key)      await borrarComprobante(f.s3Key).catch(() => {});
    if (f.thumbS3Key) await borrarComprobante(f.thumbS3Key).catch(() => {});
  }
  return true;
}
