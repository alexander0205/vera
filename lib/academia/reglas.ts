/**
 * Reglas de la Academia que no tocan la base: quién ve qué y qué se acepta
 * cuando el administrador guarda un video.
 *
 * Quién ve qué:
 *  - Cualquier persona con sesión ve los videos PUBLICADOS: son material de
 *    entrenamiento de Zero, no datos de una empresa. Cada pantalla ya filtra
 *    por permisos quién llega a ella; la tarjeta solo aparece dentro de ellas.
 *  - Los borradores y la administración son solo del administrador de la
 *    plataforma (`platformRole === 'admin'`, la misma guarda de /admin).
 */

import { PANTALLAS, esPantalla } from '@/lib/config/pantallas';
import { parsearLineasConTiempo } from './tiempo';
import { MENSAJE_ENLACE_VIMEO, datosDeVimeo, urlHttpsValida } from './vimeo';

export const MODULOS_ACADEMIA = [
  { id: 'general', label: 'General' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'pos', label: 'Punto de Venta' },
  { id: 'escolar', label: 'Gobernanza' },
  { id: 'contabilidad', label: 'Contabilidad' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'administracion', label: 'Administración' },
] as const;

export type ModuloAcademia = (typeof MODULOS_ACADEMIA)[number]['id'];

export const esModuloAcademia = (m: unknown): m is ModuloAcademia =>
  typeof m === 'string' && MODULOS_ACADEMIA.some((x) => x.id === m);

export const nombreDeModulo = (m: string) => MODULOS_ACADEMIA.find((x) => x.id === m)?.label ?? 'General';

/** Las pantallas a las que se puede atar un video, agrupadas por módulo para el selector. */
export function pantallasParaVideos(): { id: string; label: string; modulo: string }[] {
  return PANTALLAS.map((p) => ({ id: p.id, label: p.label, modulo: p.modulo }));
}

export interface ActorAcademia { platformRole?: string | null }

export const puedeAdministrarAcademia = (u: ActorAcademia | null | undefined): boolean => u?.platformRole === 'admin';

/** Puede ver el video: publicado para cualquier persona con sesión; borrador solo el administrador. */
export function puedeVerVideo(v: { publicado: boolean }, u: ActorAcademia | null | undefined): boolean {
  if (!u) return false;
  return v.publicado || puedeAdministrarAcademia(u);
}

export function filtrarVisibles<V extends { publicado: boolean }>(videos: readonly V[], u: ActorAcademia | null | undefined): V[] {
  return videos.filter((v) => puedeVerVideo(v, u));
}

/** `Cobrar una cuenta` → `cobrar-una-cuenta`. */
export function slugDe(titulo: string): string {
  return titulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface EntradaVideo {
  slug: string;
  titulo: string;
  descripcion: string;
  modulo: ModuloAcademia;
  pantalla: string | null;
  vimeoId: string;
  vimeoHash: string | null;
  miniaturaUrl: string | null;
  duracionSeg: number;
  publicado: boolean;
  orden: number;
  capitulos: { t: number; titulo: string }[];
  transcripcion: { t: number; texto: string }[];
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Valida lo que manda el formulario de /admin. Los capítulos y la transcripción
 * llegan como el texto pegado («0:45 Aquí se abre…»), que se convierte aquí.
 * El video se da como enlace de Vimeo (`enlaceVimeo`); de él sale el id y el hash.
 */
export function validarEntradaVideo(
  b: unknown,
): { ok: true; valor: EntradaVideo } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Datos inválidos' };
  const o = b as Record<string, unknown>;
  const titulo = texto(o.titulo, 160);
  if (titulo.length < 3) return { ok: false, error: 'El título es obligatorio (mínimo 3 letras)' };
  const slug = slugDe(texto(o.slug, 80) || titulo);
  if (!slug) return { ok: false, error: 'No se pudo armar la dirección del video' };
  const modulo = o.modulo ?? 'general';
  if (!esModuloAcademia(modulo)) return { ok: false, error: 'Módulo desconocido' };
  let pantalla: string | null = null;
  if (o.pantalla !== undefined && o.pantalla !== null && o.pantalla !== '') {
    if (!esPantalla(o.pantalla)) return { ok: false, error: 'Pantalla desconocida' };
    pantalla = o.pantalla;
  }
  const dur = Number(o.duracionSeg ?? 0);
  if (!Number.isFinite(dur) || dur < 0 || dur > 6 * 3600) return { ok: false, error: 'Duración inválida' };
  const orden = Number(o.orden ?? 0);
  if (!Number.isInteger(orden) || orden < -9999 || orden > 9999) return { ok: false, error: 'Orden inválido' };
  const publicado = o.publicado === true;
  const vimeo = datosDeVimeo(typeof o.enlaceVimeo === 'string' ? o.enlaceVimeo : '');
  if (!vimeo) return { ok: false, error: MENSAJE_ENLACE_VIMEO };
  let miniaturaUrl: string | null = null;
  if (typeof o.miniaturaUrl === 'string' && o.miniaturaUrl.trim()) {
    miniaturaUrl = urlHttpsValida(o.miniaturaUrl);
    if (!miniaturaUrl) return { ok: false, error: 'La miniatura propia debe ser una dirección https válida' };
  }

  const capitulos = parsearLineasConTiempo(texto(o.capitulos, 20_000)).map((l) => ({ t: l.t, titulo: l.texto.slice(0, 160) }));
  const transcripcion = parsearLineasConTiempo(texto(o.transcripcion, 400_000)).map((l) => ({ t: l.t, texto: l.texto.slice(0, 1_000) }));

  return {
    ok: true,
    valor: {
      slug, titulo, descripcion: texto(o.descripcion, 2_000), modulo, pantalla, vimeoId: vimeo.id, vimeoHash: vimeo.hash, miniaturaUrl,
      duracionSeg: Math.round(dur), publicado, orden, capitulos, transcripcion,
    },
  };
}

/** ¿El error de la base es «ya existe» (violación de unicidad, 23505)? Drizzle lo envuelve en `cause`. */
export function esChoqueUnico(e: unknown): boolean {
  const o = e as { code?: unknown; cause?: { code?: unknown } } | null;
  return o?.code === '23505' || o?.cause?.code === '23505';
}

/**
 * La Academia enseña lo que la empresa tiene: los videos de sus módulos más los
 * «General». `modulos` null = sin filtro (el administrador de la plataforma
 * ve todo lo publicado).
 */
export function filtrarPorModulos<V extends { modulo: string }>(videos: readonly V[], modulos: readonly string[] | null): V[] {
  if (modulos === null) return [...videos];
  return videos.filter((v) => v.modulo === 'general' || modulos.includes(v.modulo));
}

/**
 * Regla del dueño: si no está configurado, no se muestra. Mientras no haya NINGÚN
 * video publicado, la Academia no existe para los usuarios normales (ni menú, ni
 * página, ni tarjetas, ni «Aprender»). El administrador de la plataforma sigue
 * entrando a /admin/academia (otra ruta, otra regla) a subir el primero.
 */
export const academiaVisibleEnMenu = (hayPublicados: boolean): boolean => hayPublicados;

export function puedeVerPaginaAcademia(d: { hayPublicados: boolean; esAdmin: boolean }): boolean {
  return d.hayPublicados || d.esAdmin;
}
