import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getTeamModules } from '@/lib/auth/modules';
import { academiaProgreso, academiaTarjetas, academiaVideos, type AcademiaVideo } from '@/lib/db/schema';
import { ESTADO_NUEVO, siguienteEstado, type AccionTarjeta, type EstadoTarjeta } from './tarjeta';
import type { VideoDetalle, VideoLista } from './tipos';

/**
 * Lectura y escritura de la Academia. Falla CERRADO: si las tablas aún no
 * existen (migración 0240 sin correr) o la base no contesta, las lecturas
 * devuelven vacío y las escrituras no hacen nada. Ninguna pantalla del sistema
 * se rompe por esto: sin videos, la Academia y las tarjetas simplemente no
 * muestran nada.
 */

let avisado = false;
function aviso(e: unknown) {
  if (avisado) return;
  avisado = true;
  console.warn('[academia] no se pudo leer la base (¿migración 0240 sin correr?):', e instanceof Error ? e.message : e);
}

async function seguro<T>(vacio: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    aviso(e);
    return vacio;
  }
}

/** Lo que necesita una lista: sin la transcripción ni los capítulos, que pesan. */
const COLUMNAS_LISTA = {
  id: academiaVideos.id, slug: academiaVideos.slug, titulo: academiaVideos.titulo, descripcion: academiaVideos.descripcion,
  modulo: academiaVideos.modulo, pantalla: academiaVideos.pantalla, duracionSeg: academiaVideos.duracionSeg,
  vimeoId: academiaVideos.vimeoId, vimeoHash: academiaVideos.vimeoHash, miniaturaUrl: academiaVideos.miniaturaUrl, publicado: academiaVideos.publicado,
};
type FilaLista = { [K in keyof typeof COLUMNAS_LISTA]: AcademiaVideo[K] };

function aLista(v: FilaLista, p?: { visto: boolean; avanceSeg: number }): VideoLista {
  return {
    id: v.id, slug: v.slug, titulo: v.titulo, descripcion: v.descripcion, modulo: v.modulo, pantalla: v.pantalla,
    duracionSeg: v.duracionSeg, vimeoId: v.vimeoId, vimeoHash: v.vimeoHash, miniaturaUrl: v.miniaturaUrl,
    publicado: v.publicado, visto: p?.visto ?? false, avanceSeg: p?.avanceSeg ?? 0,
  };
}

async function progresoDe(userId: number, ids: number[]): Promise<Map<number, { visto: boolean; avanceSeg: number }>> {
  if (ids.length === 0) return new Map();
  const filas = await db.select().from(academiaProgreso)
    .where(and(eq(academiaProgreso.userId, userId), inArray(academiaProgreso.videoId, ids)));
  return new Map(filas.map((f) => [f.videoId, { visto: f.visto, avanceSeg: f.avanceSeg }]));
}

const TTL_CATALOGO_MS = 15_000;
let catalogo: { hasta: number; datos: AcademiaVideo[] } | null = null;

/**
 * Los videos PUBLICADOS con su transcripción, para buscar. Se guardan unos
 * segundos en memoria: sin esto cada letra que se escribe en el buscador traía
 * todas las transcripciones de la base. Un cambio del administrador se nota
 * cuando vence (o antes, si cae en la misma instancia: `olvidarCatalogo`).
 */
export function videosCrudos(): Promise<AcademiaVideo[]> {
  if (catalogo && catalogo.hasta > Date.now()) return Promise.resolve(catalogo.datos);
  return seguro([], async () => {
    const datos = await db.select().from(academiaVideos)
      .where(eq(academiaVideos.publicado, true))
      .orderBy(asc(academiaVideos.orden), desc(academiaVideos.id));
    catalogo = { hasta: Date.now() + TTL_CATALOGO_MS, datos };
    return datos;
  });
}

const TTL_HAY_MS = 30_000;
let hay: { hasta: number; valor: boolean } | null = null;

/**
 * ¿Hay al menos UN video publicado? Es lo que decide si la Academia se muestra
 * (menú, página, tarjetas y «Aprender»): sin ninguno, no se muestra nada. Una
 * consulta mínima (`LIMIT 1`) con caché corta en memoria; si la tabla no existe
 * (migración 0240 sin correr) o la base no contesta, es `false` y nada se rompe.
 */
export async function hayAcademia(): Promise<boolean> {
  if (hay && hay.hasta > Date.now()) return hay.valor;
  const valor = await seguro(false, async () => {
    const [f] = await db.select({ id: academiaVideos.id }).from(academiaVideos).where(eq(academiaVideos.publicado, true)).limit(1);
    return Boolean(f);
  });
  hay = { hasta: Date.now() + TTL_HAY_MS, valor };
  return valor;
}

export function olvidarCatalogo() { catalogo = null; hay = null; }

export async function listarVideos(userId: number): Promise<VideoLista[]> {
  return seguro([], async () => {
    const filas = await db.select(COLUMNAS_LISTA).from(academiaVideos)
      .where(eq(academiaVideos.publicado, true))
      .orderBy(asc(academiaVideos.orden), desc(academiaVideos.id));
    const prog = await progresoDe(userId, filas.map((f) => f.id));
    return filas.map((f) => aLista(f, prog.get(f.id)));
  });
}

export async function listaDeCrudos(userId: number, filas: AcademiaVideo[]): Promise<VideoLista[]> {
  const prog = await seguro(new Map<number, { visto: boolean; avanceSeg: number }>(), () => progresoDe(userId, filas.map((f) => f.id)));
  return filas.map((f) => aLista(f, prog.get(f.id)));
}

export async function videoPorSlug(userId: number, slug: string, borradores: boolean): Promise<VideoDetalle | null> {
  return seguro<VideoDetalle | null>(null, async () => {
    const [v] = await db.select().from(academiaVideos).where(eq(academiaVideos.slug, slug)).limit(1);
    if (!v || (!v.publicado && !borradores)) return null;
    const prog = await progresoDe(userId, [v.id]);
    return {
      ...aLista(v, prog.get(v.id)),
      capitulos: v.capitulos, transcripcion: v.transcripcion,
    };
  });
}

/** Los videos publicados de una pantalla (para la tarjeta y el botón «Aprender»). */
export async function videosDePantalla(userId: number, pantalla: string): Promise<VideoLista[]> {
  return seguro([], async () => {
    const filas = await db.select(COLUMNAS_LISTA).from(academiaVideos)
      .where(and(eq(academiaVideos.pantalla, pantalla), eq(academiaVideos.publicado, true)))
      .orderBy(asc(academiaVideos.orden), desc(academiaVideos.id));
    const prog = await progresoDe(userId, filas.map((f) => f.id));
    return filas.map((f) => aLista(f, prog.get(f.id)));
  });
}

export async function estadoTarjeta(userId: number, pantalla: string): Promise<EstadoTarjeta> {
  return seguro(ESTADO_NUEVO, async () => {
    const [f] = await db.select().from(academiaTarjetas)
      .where(and(eq(academiaTarjetas.userId, userId), eq(academiaTarjetas.pantalla, pantalla))).limit(1);
    return f
      ? { nunca: f.nunca, ocultaHasta: f.ocultaHasta, vecesMostrada: f.vecesMostrada, mostradaEn: f.mostradaEn }
      : ESTADO_NUEVO;
  });
}

/** Aplica la acción sobre el estado guardado y lo guarda. Devuelve `false` si no se pudo. */
export async function aplicarAccionTarjeta(userId: number, pantalla: string, accion: AccionTarjeta): Promise<boolean> {
  return seguro(false, async () => {
    const antes = await estadoTarjeta(userId, pantalla);
    const e = siguienteEstado(antes, accion, new Date());
    await db.insert(academiaTarjetas)
      .values({ userId, pantalla, nunca: e.nunca, ocultaHasta: e.ocultaHasta, vecesMostrada: e.vecesMostrada, mostradaEn: e.mostradaEn, actualizadoEn: new Date() })
      .onConflictDoUpdate({
        target: [academiaTarjetas.userId, academiaTarjetas.pantalla],
        set: { nunca: e.nunca, ocultaHasta: e.ocultaHasta, vecesMostrada: e.vecesMostrada, mostradaEn: e.mostradaEn, actualizadoEn: new Date() },
      });
    return true;
  });
}

/** El avance de la persona en un video. `visto` solo sube: nunca se desmarca. */
export async function guardarProgreso(userId: number, videoId: number, avanceSeg: number, visto: boolean): Promise<boolean> {
  return seguro(false, async () => {
    const [v] = await db.select({ id: academiaVideos.id }).from(academiaVideos)
      .where(and(eq(academiaVideos.id, videoId), eq(academiaVideos.publicado, true))).limit(1);
    if (!v) return false;
    const avance = Math.max(0, Math.min(Math.floor(avanceSeg), 6 * 3600));
    await db.insert(academiaProgreso)
      .values({ userId, videoId, avanceSeg: avance, visto, actualizadoEn: new Date() })
      .onConflictDoUpdate({
        target: [academiaProgreso.userId, academiaProgreso.videoId],
        set: { avanceSeg: avance, visto: sql`${academiaProgreso.visto} OR ${visto}`, actualizadoEn: new Date() },
      });
    return true;
  });
}

/**
 * Los módulos que enseña la Academia a esta persona: los de su empresa activa.
 * `null` = todos (administrador de la plataforma). Sin empresa o ante un error,
 * lista vacía: solo los «General».
 */
export async function modulosParaAcademia(user: { platformRole?: string | null }): Promise<string[] | null> {
  if (user.platformRole === 'admin') return null;
  return seguro<string[]>([], async () => {
    const teamId = await getTeamIdForUser();
    return teamId ? await getTeamModules(teamId) : [];
  });
}
