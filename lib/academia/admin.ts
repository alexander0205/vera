import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { academiaVideos, type AcademiaVideo } from '@/lib/db/schema';
import { lineasATexto } from './tiempo';
import { esChoqueUnico, validarEntradaVideo } from './reglas';
import { olvidarCatalogo } from './datos';
import { completarDesdeOembed, leerOembedVimeo, type LectorOembed } from './vimeo-oembed';

/** Un video como lo edita el administrador: capítulos y transcripción vuelven a ser texto. */
export interface VideoAdmin {
  id: number;
  slug: string;
  titulo: string;
  descripcion: string;
  modulo: string;
  pantalla: string | null;
  vimeoId: string;
  vimeoHash: string | null;
  miniaturaUrl: string | null;
  duracionSeg: number;
  publicado: boolean;
  orden: number;
  capitulos: string;
  transcripcion: string;
  actualizadoEn: string;
}

export function aAdmin(v: AcademiaVideo): VideoAdmin {
  return {
    id: v.id, slug: v.slug, titulo: v.titulo, descripcion: v.descripcion, modulo: v.modulo, pantalla: v.pantalla,
    vimeoId: v.vimeoId, vimeoHash: v.vimeoHash, miniaturaUrl: v.miniaturaUrl, duracionSeg: v.duracionSeg, publicado: v.publicado, orden: v.orden,
    capitulos: lineasATexto(v.capitulos), transcripcion: lineasATexto(v.transcripcion),
    actualizadoEn: v.actualizadoEn.toISOString(),
  };
}

export async function listarParaAdmin(): Promise<VideoAdmin[]> {
  const filas = await db.select().from(academiaVideos).orderBy(asc(academiaVideos.orden), desc(academiaVideos.id));
  return filas.map(aAdmin);
}

type Resultado = { ok: true; video: VideoAdmin } | { ok: false; error: string; status: number };

const MENSAJE_SLUG = 'Ya hay un video con esa dirección. Cambia el título o la dirección.';
const MENSAJE_VIDEO = 'Ese video de Vimeo ya está en la Academia.';

/** Crea (`id` null) o actualiza un video con lo que mandó el formulario. */
/** `lector` se puede reemplazar (las pruebas no llaman a Vimeo). */
export async function guardarVideo(id: number | null, body: unknown, lector: LectorOembed = leerOembedVimeo): Promise<Resultado> {
  if (id !== null) {
    const [actual] = await db.select({ id: academiaVideos.id }).from(academiaVideos).where(eq(academiaVideos.id, id)).limit(1);
    if (!actual) return { ok: false, error: 'No encontrado', status: 404 };
  }
  const v = validarEntradaVideo(body);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  // La miniatura y la duración que falten se leen del oEmbed de Vimeo; si falla, quedan como las escribió el admin.
  const e = await completarDesdeOembed(v.valor, { id: v.valor.vimeoId, hash: v.valor.vimeoHash }, lector);

  const [repetido] = await db.select({ id: academiaVideos.id }).from(academiaVideos).where(eq(academiaVideos.slug, e.slug)).limit(1);
  if (repetido && repetido.id !== id) return { ok: false, error: MENSAJE_SLUG, status: 409 };
  const [mismoVideo] = await db.select({ id: academiaVideos.id }).from(academiaVideos).where(eq(academiaVideos.vimeoId, e.vimeoId)).limit(1);
  if (mismoVideo && mismoVideo.id !== id) return { ok: false, error: MENSAJE_VIDEO, status: 409 };

  const datos = {
    slug: e.slug, titulo: e.titulo, descripcion: e.descripcion, modulo: e.modulo, pantalla: e.pantalla,
    vimeoId: e.vimeoId, vimeoHash: e.vimeoHash, miniaturaUrl: e.miniaturaUrl,
    duracionSeg: e.duracionSeg, publicado: e.publicado, orden: e.orden, capitulos: e.capitulos, transcripcion: e.transcripcion,
    actualizadoEn: new Date(),
  };
  let fila: AcademiaVideo;
  try {
    [fila] = id === null
      ? await db.insert(academiaVideos).values(datos).returning()
      : await db.update(academiaVideos).set(datos).where(eq(academiaVideos.id, id)).returning();
  } catch (err) {
    // Dos guardados a la vez con la misma dirección o el mismo video: chocan con el índice único.
    if (esChoqueUnico(err)) return { ok: false, error: `${MENSAJE_SLUG} (o el video de Vimeo ya está en la Academia).`, status: 409 };
    throw err;
  }
  olvidarCatalogo();
  return { ok: true, video: aAdmin(fila) };
}

export async function borrarVideo(id: number): Promise<boolean> {
  const [fila] = await db.delete(academiaVideos).where(eq(academiaVideos.id, id)).returning({ id: academiaVideos.id });
  if (fila) olvidarCatalogo();
  return Boolean(fila);
}
