/**
 * Videos de Vimeo de la Academia: sacar el id (y el hash de los no listados) de
 * un enlace pegado, y armar las direcciones del iframe y del oEmbed. Puro: lo
 * usan servidor, cliente y pruebas.
 *
 * Formatos aceptados (hosts vimeo.com, www.vimeo.com y player.vimeo.com):
 *   vimeo.com/<id>                    vimeo.com/<id>/<hash>      vimeo.com/<id>?h=<hash>
 *   player.vimeo.com/video/<id>?h=<hash>                         vimeo.com/channels/<x>/<id>
 * Cualquier otro sitio —o un host que imite a Vimeo— se rechaza: lo que se guarda
 * es SOLO el id y el hash, y de ahí se arma la dirección, así que nada de lo
 * pegado llega al iframe.
 */

export const MENSAJE_ENLACE_VIMEO =
  'Pega un enlace de Vimeo: vimeo.com/123456789, vimeo.com/123456789/abcdef1234 o player.vimeo.com/video/123456789?h=abcdef1234';

const ID = /^\d{1,12}$/;
const HASH = /^[A-Za-z0-9]{6,40}$/;
const HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

export interface VideoVimeo { id: string; hash: string | null }

/** El id (y el hash de un no listado, si viene) de un enlace de Vimeo, o `null`. */
export function datosDeVimeo(entrada: string): VideoVimeo | null {
  const t = entrada.trim();
  if (!t || t.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;
  const partes = url.pathname.split('/').filter(Boolean);
  const hashDeQuery = url.searchParams.get('h');

  let id: string | undefined;
  let hash: string | null = null;
  if (host === 'player.vimeo.com') {
    if (partes[0] !== 'video' || partes.length !== 2) return null;
    id = partes[1];
    hash = hashDeQuery;
  } else if (partes[0] === 'channels') {
    if (partes.length !== 3) return null;
    id = partes[2];
    hash = hashDeQuery;
  } else if (partes.length === 1) {
    id = partes[0];
    hash = hashDeQuery;
  } else if (partes.length === 2) {
    id = partes[0];
    hash = partes[1];
  } else {
    return null;
  }
  if (!id || !ID.test(id)) return null;
  if (hash !== null && !HASH.test(hash)) return null;
  return { id, hash };
}

export const esIdVimeo = (id: unknown): id is string => typeof id === 'string' && ID.test(id);
export const esHashVimeo = (h: unknown): h is string => typeof h === 'string' && HASH.test(h);

/** El enlace canónico (el que entiende oEmbed): con hash si es un no listado. */
export function enlaceCanonicoVimeo(v: VideoVimeo): string {
  return `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ''}`;
}

/** La dirección del iframe: sin cookies de rastreo (`dnt=1`) y sin títulos encima del video. */
export function urlEmbedVimeo(v: VideoVimeo): string {
  const p = new URLSearchParams();
  if (v.hash) p.set('h', v.hash);
  for (const [k, val] of [['dnt', '1'], ['title', '0'], ['byline', '0'], ['portrait', '0'], ['playsinline', '1']]) p.set(k, val);
  return `https://player.vimeo.com/video/${v.id}?${p.toString()}`;
}

/** La dirección del oEmbed público de Vimeo (sin llave). */
export const urlOembedVimeo = (v: VideoVimeo): string =>
  `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(enlaceCanonicoVimeo(v))}`;

/** Una miniatura propia (o la que da Vimeo) solo vale como URL https sin credenciales. */
export function urlHttpsValida(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null;
  const t = entrada.trim();
  if (!t || t.length > 500) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Lo que se aprovecha de la respuesta de oEmbed: miniatura https y duración en segundos. */
export function interpretarOembed(json: unknown): { miniaturaUrl: string | null; duracionSeg: number } {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const d = typeof o.duration === 'number' && Number.isFinite(o.duration) ? Math.round(o.duration) : 0;
  return {
    miniaturaUrl: urlHttpsValida(o.thumbnail_url),
    duracionSeg: d > 0 && d <= 6 * 3600 ? d : 0,
  };
}
