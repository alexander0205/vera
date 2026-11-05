/**
 * El comprobante de la transferencia adjunto a un pago a proveedor.
 *
 * Reaprovecha el andamiaje de archivos de los demás comprobantes
 * (`prepararArchivo`: valida por magic bytes, sube a S3 o cae a base64 sin
 * credenciales). Aquí solo se decide el dueño (el pago) y se persiste.
 *
 * Todo por SQL crudo y protegido con `tablaExiste`: una base a la que todavía no
 * se le corrió la migración 0223 sigue pagando a proveedores igual, solo sin
 * poder adjuntar el comprobante.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { prepararArchivo, borrarArchivoSiHay } from '@/lib/administracion-escolar/documentos-archivo';
import { leerComprobante } from '@/lib/storage/comprobantes';
import { tablaExiste } from './bancos';
import type { LecturaPagoIa } from './comprobante-pago-lectura';

export class ComprobantePagoError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'ComprobantePagoError'; }
}

export interface ComprobantePagoResumen {
  pagoId: number;
  nombre: string | null;
  mime: string;
  tamanoBytes: number;
  lectura: LecturaPagoIa | null;
  /** Otro pago de la empresa ya tiene exactamente este archivo. */
  repetidoEnPagoId: number | null;
}

const NO_MIGRADO = 'Adjuntar comprobantes necesita una actualización de la base que aún no se aplica.';

/** El pago existe y es de esta empresa. */
async function pagoDelTeam(teamId: number, pagoId: number): Promise<boolean> {
  const filas = await db.execute(sql`SELECT id FROM pagos_proveedores WHERE id = ${pagoId} AND team_id = ${teamId}`) as unknown as { id: number }[];
  return filas.length > 0;
}

/**
 * Adjunta (o reemplaza) el comprobante de un pago. `lectura` es lo que la IA leyó
 * y la persona vio al pagar; se guarda tal cual vino ya limpia.
 */
export async function adjuntarComprobantePago(input: {
  teamId: number;
  pagoId: number;
  buffer: Buffer;
  nombreOriginal: string;
  lectura: LecturaPagoIa | null;
  subidoPor: number | null;
}): Promise<ComprobantePagoResumen> {
  if (!await tablaExiste('pagos_proveedores_comprobantes')) throw new ComprobantePagoError(NO_MIGRADO, 503);
  if (!await pagoDelTeam(input.teamId, input.pagoId)) throw new ComprobantePagoError('Pago no encontrado.', 404);

  const g = await prepararArchivo(input.teamId, input.buffer, input.nombreOriginal);
  const lectura = input.lectura ? JSON.stringify(input.lectura) : null;

  let previo: { storage: string; s3Key: string | null }[] = [];
  try {
    // El anterior se lee antes de pisarlo para borrar su objeto del bucket después.
    previo = await db.execute(sql`
      SELECT storage, s3_key AS "s3Key" FROM pagos_proveedores_comprobantes
      WHERE pago_id = ${input.pagoId} AND team_id = ${input.teamId}`) as unknown as { storage: string; s3Key: string | null }[];

    await db.execute(sql`
      INSERT INTO pagos_proveedores_comprobantes
        (team_id, pago_id, archivo_nombre, mime, tamano_bytes, sha256, storage, s3_key, contenido,
         lectura_ia, lectura_ia_en, subido_por)
      VALUES (${input.teamId}, ${input.pagoId}, ${g.archivoNombre}, ${g.mime}, ${g.tamanoBytes}, ${g.sha256},
              ${g.storage}, ${g.s3Key}, ${g.contenido}, ${lectura}::jsonb,
              ${lectura ? sql`NOW()` : sql`NULL`}, ${input.subidoPor})
      ON CONFLICT (pago_id) DO UPDATE SET
        archivo_nombre = EXCLUDED.archivo_nombre, mime = EXCLUDED.mime, tamano_bytes = EXCLUDED.tamano_bytes,
        sha256 = EXCLUDED.sha256, storage = EXCLUDED.storage, s3_key = EXCLUDED.s3_key,
        contenido = EXCLUDED.contenido, lectura_ia = EXCLUDED.lectura_ia, lectura_ia_en = EXCLUDED.lectura_ia_en,
        subido_por = EXCLUDED.subido_por, created_at = NOW()
    `);
  } catch (e) {
    // Lo recién subido no lo referencia nadie.
    await borrarArchivoSiHay(g.storage, g.s3Key).catch(() => undefined);
    throw e;
  }
  for (const p of previo) await borrarArchivoSiHay(p.storage as 's3' | 'db', p.s3Key).catch(() => undefined);

  const [dup] = await db.execute(sql`
    SELECT pago_id AS "pagoId" FROM pagos_proveedores_comprobantes
    WHERE team_id = ${input.teamId} AND sha256 = ${g.sha256} AND pago_id <> ${input.pagoId} LIMIT 1`) as unknown as { pagoId: number }[];

  return {
    pagoId: input.pagoId, nombre: g.archivoNombre, mime: g.mime, tamanoBytes: g.tamanoBytes,
    lectura: input.lectura, repetidoEnPagoId: dup?.pagoId ?? null,
  };
}

/** Los comprobantes de un grupo de pagos, por id de pago. Vacío si la migración no corrió. */
export async function comprobantesDePagos(teamId: number, pagoIds: number[]): Promise<Map<number, ComprobantePagoResumen>> {
  const mapa = new Map<number, ComprobantePagoResumen>();
  if (pagoIds.length === 0 || !await tablaExiste('pagos_proveedores_comprobantes')) return mapa;
  const filas = await db.execute(sql`
    SELECT pago_id AS "pagoId", archivo_nombre AS nombre, mime, tamano_bytes AS tamano, lectura_ia AS lectura
    FROM pagos_proveedores_comprobantes
    WHERE team_id = ${teamId} AND pago_id IN (${sql.join(pagoIds.map((i) => sql`${i}`), sql`, `)})
  `) as unknown as { pagoId: number; nombre: string | null; mime: string; tamano: number; lectura: LecturaPagoIa | null }[];
  for (const f of filas) {
    mapa.set(Number(f.pagoId), {
      pagoId: Number(f.pagoId), nombre: f.nombre, mime: f.mime, tamanoBytes: Number(f.tamano),
      lectura: f.lectura ?? null, repetidoEnPagoId: null,
    });
  }
  return mapa;
}

/** El binario de un comprobante, con su empresa ya comprobada. */
export async function leerComprobantePago(
  teamId: number, pagoId: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  if (!await tablaExiste('pagos_proveedores_comprobantes')) return null;
  const [f] = await db.execute(sql`
    SELECT archivo_nombre AS nombre, mime, storage, s3_key AS "s3Key", contenido
    FROM pagos_proveedores_comprobantes WHERE pago_id = ${pagoId} AND team_id = ${teamId}`) as unknown as
    { nombre: string | null; mime: string; storage: string; s3Key: string | null; contenido: string | null }[];
  if (!f) return null;
  const nombre = f.nombre ?? 'comprobante';
  if (f.storage === 'db') return f.contenido ? { buffer: Buffer.from(f.contenido, 'base64'), mime: f.mime, nombre } : null;
  return f.s3Key ? { buffer: await leerComprobante(f.s3Key), mime: f.mime, nombre } : null;
}

/** Quita el comprobante de un pago (y su objeto en el bucket). */
export async function borrarComprobantePago(teamId: number, pagoId: number): Promise<boolean> {
  if (!await tablaExiste('pagos_proveedores_comprobantes')) return false;
  const filas = await db.execute(sql`
    DELETE FROM pagos_proveedores_comprobantes WHERE pago_id = ${pagoId} AND team_id = ${teamId}
    RETURNING storage, s3_key AS "s3Key"`) as unknown as { storage: string; s3Key: string | null }[];
  for (const f of filas) await borrarArchivoSiHay(f.storage as 's3' | 'db', f.s3Key).catch(() => undefined);
  return filas.length > 0;
}
