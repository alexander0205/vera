import 'server-only';
import { db } from '@/lib/db/drizzle';
import { fotos } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  borrarFoto, claveFoto, subirFotoConMiniatura, urlDeFoto, validarImagen,
  MAX_BYTES_SUBIDA,
} from '@/lib/fotos/storage';
import type { EntidadFoto } from '@/lib/fotos/entidades';

/** Lo que devuelven los endpoints al navegador: URLs ya firmadas, nunca refs. */
export interface FotoPublica {
  url: string | null;
  urlMiniatura: string | null;
  actualizadaEn: string;
  origen: string;
}

/** Foto vigente de una entidad, con las URLs ya resueltas. */
export async function obtenerFoto(
  teamId: number,
  entidad: EntidadFoto,
  entidadId: number,
): Promise<FotoPublica | null> {
  const [fila] = await db.select().from(fotos)
    .where(and(eq(fotos.teamId, teamId), eq(fotos.entidad, entidad), eq(fotos.entidadId, entidadId)))
    .limit(1);
  if (!fila) return null;
  const [url, urlMiniatura] = await Promise.all([
    urlDeFoto(fila.ref),
    urlDeFoto(fila.refMiniatura),
  ]);
  return {
    url,
    urlMiniatura: urlMiniatura ?? url,
    actualizadaEn: fila.updatedAt.toISOString(),
    origen: fila.origen,
  };
}

export type ErrorFoto = 'vacia' | 'muy-grande' | 'no-es-imagen';

export interface ResultadoGuardado {
  ok: true;
  fotoId: number;
  foto: FotoPublica;
}

/**
 * Valida, procesa y guarda la foto de una entidad. Reemplaza la anterior si la
 * había (una foto vigente por entidad) y borra sus objetos del bucket.
 *
 * El llamador ya comprobó permisos y pertenencia al team: aquí solo se
 * desconfía del binario.
 */
export async function guardarFotoEntidad(opciones: {
  teamId: number;
  entidad: EntidadFoto;
  entidadId: number;
  binario: Buffer;
  origen: 'movil' | 'archivo';
  usuarioId?: number | null;
}): Promise<ResultadoGuardado | { ok: false; error: ErrorFoto }> {
  const { teamId, entidad, entidadId, binario, origen } = opciones;

  if (binario.length === 0) return { ok: false, error: 'vacia' };
  if (binario.length > MAX_BYTES_SUBIDA) return { ok: false, error: 'muy-grande' };
  // El Content-Type lo escribe el cliente; la cabecera del archivo no. Mandamos
  // la cabecera.
  if (!(await validarImagen(binario))) return { ok: false, error: 'no-es-imagen' };

  const subida = await subirFotoConMiniatura(binario, claveFoto(teamId, entidad, entidadId));

  // Refs anteriores: se borran del bucket DESPUÉS de que la fila nueva quedó
  // guardada, para no quedarnos sin foto si el upsert falla.
  const [anterior] = await db.select({ ref: fotos.ref, refMiniatura: fotos.refMiniatura })
    .from(fotos)
    .where(and(eq(fotos.teamId, teamId), eq(fotos.entidad, entidad), eq(fotos.entidadId, entidadId)))
    .limit(1);

  const [fila] = await db.insert(fotos).values({
    teamId,
    entidad,
    entidadId,
    ref: subida.ref,
    refMiniatura: subida.refMiniatura,
    bytes: subida.bytes,
    ancho: subida.ancho,
    alto: subida.alto,
    origen,
    subidaPor: opciones.usuarioId ?? null,
  }).onConflictDoUpdate({
    target: [fotos.teamId, fotos.entidad, fotos.entidadId],
    set: {
      ref: subida.ref,
      refMiniatura: subida.refMiniatura,
      bytes: subida.bytes,
      ancho: subida.ancho,
      alto: subida.alto,
      origen,
      subidaPor: opciones.usuarioId ?? null,
      updatedAt: new Date(),
    },
  }).returning();

  if (anterior && anterior.ref !== subida.ref) {
    await Promise.all([borrarFoto(anterior.ref), borrarFoto(anterior.refMiniatura)]);
  }

  const [url, urlMiniatura] = await Promise.all([
    urlDeFoto(fila.ref),
    urlDeFoto(fila.refMiniatura),
  ]);
  return {
    ok: true,
    fotoId: fila.id,
    foto: {
      url,
      urlMiniatura: urlMiniatura ?? url,
      actualizadaEn: fila.updatedAt.toISOString(),
      origen: fila.origen,
    },
  };
}

/** Quita la foto de una entidad. Devuelve false si no había. */
export async function eliminarFotoEntidad(
  teamId: number,
  entidad: EntidadFoto,
  entidadId: number,
): Promise<boolean> {
  const [fila] = await db.delete(fotos)
    .where(and(eq(fotos.teamId, teamId), eq(fotos.entidad, entidad), eq(fotos.entidadId, entidadId)))
    .returning({ ref: fotos.ref, refMiniatura: fotos.refMiniatura });
  if (!fila) return false;
  await Promise.all([borrarFoto(fila.ref), borrarFoto(fila.refMiniatura)]);
  return true;
}

/**
 * Saca el binario de la petición. Acepta multipart (campo `foto`, que es lo que
 * manda un <input type="file"> y el canvas del móvil) o el cuerpo crudo.
 *
 * Corta por tamaño ANTES de leerlo entero a memoria cuando el Content-Length lo
 * declara: subir 500 MB no debe tumbar la función.
 */
export async function leerImagenDePeticion(req: Request): Promise<Buffer | null> {
  const declarado = Number(req.headers.get('content-length') ?? 0);
  if (declarado > MAX_BYTES_SUBIDA) return null;

  const tipo = req.headers.get('content-type') ?? '';
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData();
    const campo = form.get('foto');
    if (!(campo instanceof Blob)) return null;
    if (campo.size > MAX_BYTES_SUBIDA) return null;
    return Buffer.from(await campo.arrayBuffer());
  }

  const buf = Buffer.from(await req.arrayBuffer());
  return buf.length > MAX_BYTES_SUBIDA ? null : buf;
}
