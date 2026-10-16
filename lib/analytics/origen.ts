/**
 * De dónde llegó quien se registra: la primera visita, guardada en una cookie
 * y apuntada en la base al crear la cuenta.
 *
 * Google Analytics cuenta visitas, pero no sabe quién de ellas terminó
 * creando una empresa —y no debe saberlo: no le mandamos correos ni nombres—.
 * Al revés, la base sabe quién se registró pero no por dónde entró. Esta
 * cookie es el puente: la web pública la escribe en la PRIMERA visita (fuente,
 * campaña, página de entrada) y el alta la lee y la deja en `audit_logs`. Así
 * la pantalla «Embudo» del admin puede decir «este registro vino de Google,
 * este de WhatsApp, este de ChatGPT» sin depender de que el navegador deje
 * cargar Analytics.
 *
 * Primer contacto y no último: el que se queda es el canal que trajo a la
 * persona por primera vez, que es el que hay que saber para invertir. La
 * cookie no se pisa en visitas posteriores.
 *
 * Nada de lo que lleva identifica a nadie: un dominio, unos `utm_*`, un camino
 * de la web pública y una fecha. Se lee con desconfianza —viene del
 * navegador— y se recorta campo a campo.
 */

export const COOKIE_ORIGEN = 'zero_origen';

/** 90 días: más que eso, el registro ya no se le puede atribuir a la visita. */
export const VIDA_COOKIE_ORIGEN_S = 90 * 24 * 60 * 60;

export interface Origen {
  /** Fecha de la primera visita, AAAA-MM-DD. */
  f: string;
  /** Camino de la página de entrada, sin query. */
  l: string;
  /** Dominio de la página que mandó la visita, si es de fuera de Zero. */
  r?: string;
  us?: string; // utm_source
  um?: string; // utm_medium
  uc?: string; // utm_campaign
  ut?: string; // utm_term
  ux?: string; // utm_content
  /** Llegó por un anuncio de Google, Meta o Microsoft (`gclid`, `fbclid`, `msclkid`). */
  g?: 1;
  fb?: 1;
  ms?: 1;
}

const MAX = 100;
const recorte = (v: unknown, max = MAX): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // Solo texto imprimible: esto termina en un informe y en un JSON.
  const limpio = v.replace(/[^\p{L}\p{N} ._\-/:+@()]/gu, '').trim().slice(0, max);
  return limpio || undefined;
};

/** Los dominios del propio Zero no son una fuente: son la misma visita. */
const DOMINIO_PROPIO = /(^|\.)zero\.com\.do$/i;

/**
 * El origen de ESTA visita. `hoy` en AAAA-MM-DD (se pasa para poder probarlo).
 * El camino de entrada va sin query: la query de algunas pantallas lleva un
 * secreto (ver `lib/config/analytics.ts`), y los `utm_*` ya viajan aparte.
 */
export function origenDeVisita(url: URL, referrer: string, hoy: string): Origen {
  const p = url.searchParams;
  const o: Origen = { f: hoy, l: recorte(url.pathname, 120) ?? '/' };
  try {
    if (referrer) {
      const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
      if (host && !DOMINIO_PROPIO.test(host)) o.r = recorte(host);
    }
  } catch { /* referrer raro: se ignora */ }
  const us = recorte(p.get('utm_source')); if (us) o.us = us;
  const um = recorte(p.get('utm_medium')); if (um) o.um = um;
  const uc = recorte(p.get('utm_campaign')); if (uc) o.uc = uc;
  const ut = recorte(p.get('utm_term')); if (ut) o.ut = ut;
  const ux = recorte(p.get('utm_content')); if (ux) o.ux = ux;
  if (p.get('gclid')) o.g = 1;
  if (p.get('fbclid')) o.fb = 1;
  if (p.get('msclkid')) o.ms = 1;
  return o;
}

/** Lee el valor crudo de la cookie. `null` si no hay o no sirve. */
export function leerOrigen(valor: string | null | undefined): Origen | null {
  if (!valor) return null;
  let crudo: unknown;
  try { crudo = JSON.parse(decodeURIComponent(valor)); } catch { return null; }
  return validarOrigen(crudo);
}

/** El origen guardado en `audit_logs.metadata` (`{ metodo, origen }`). */
export function leerOrigenGuardado(metadata: string | null | undefined): Origen | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { origen?: unknown };
    return validarOrigen(m?.origen);
  } catch {
    return null;
  }
}

/** Revisa campo a campo lo que dice ser un origen: viene del navegador. */
function validarOrigen(crudo: unknown): Origen | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const c = crudo as Record<string, unknown>;
  const f = typeof c.f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.f) ? c.f : null;
  const l = recorte(c.l, 120);
  if (!f || !l || !l.startsWith('/')) return null;
  const o: Origen = { f, l };
  for (const k of ['r', 'us', 'um', 'uc', 'ut', 'ux'] as const) {
    const v = recorte(c[k]);
    if (v) o[k] = v;
  }
  if (c.g === 1) o.g = 1;
  if (c.fb === 1) o.fb = 1;
  if (c.ms === 1) o.ms = 1;
  return o;
}

export function escribirOrigen(o: Origen): string {
  return encodeURIComponent(JSON.stringify(o));
}

export type Canal =
  | 'Anuncios' | 'Buscador' | 'Asistente de IA' | 'Redes sociales' | 'WhatsApp'
  | 'Correo' | 'Campaña' | 'Otro sitio' | 'Directo';

const BUSCADORES = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|search\.brave\.com|ecosia\.org|yandex\.[a-z]+)$/;
const ASISTENTES = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|bard\.google\.com|you\.com|phind\.com|meta\.ai|grok\.com|x\.ai|deepseek\.com)$/;
const SOCIALES = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|t\.co|x\.com|twitter\.com|tiktok\.com|youtube\.com|reddit\.com|pinterest\.com|threads\.net)$/;
const WHATSAPP = /(^|\.)(whatsapp\.com|wa\.me)$/;
const CORREO = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/;

/**
 * El canal en palabras de negocio. Manda lo que dijo quien armó el enlace
 * (`utm_*` o el identificador de anuncio); si no hay, el dominio de donde vino.
 * Un asistente de IA va aparte de los buscadores: es justo lo que se quiere
 * medir del trabajo de AEO.
 */
export function canalDeOrigen(o: Origen | null): Canal {
  if (!o) return 'Directo';
  if (o.g || o.fb || o.ms) return 'Anuncios';
  const medio = (o.um ?? '').toLowerCase();
  const fuente = (o.us ?? '').toLowerCase();
  if (/^(cpc|ppc|paid|ads?|display|paidsocial|paid_social)$/.test(medio)) return 'Anuncios';
  if (fuente) {
    if (ASISTENTES.test(fuente) || /chatgpt|perplexity|claude|gemini|copilot/.test(fuente)) return 'Asistente de IA';
    if (/whatsapp/.test(fuente) || medio === 'whatsapp') return 'WhatsApp';
    if (medio === 'email' || medio === 'correo' || /mail/.test(fuente)) return 'Correo';
    if (medio === 'social' || /facebook|instagram|linkedin|tiktok|youtube|twitter/.test(fuente) || fuente === 'x') return 'Redes sociales';
    if (medio === 'organic') return 'Buscador';
    return 'Campaña';
  }
  const r = o.r ?? '';
  if (!r) return 'Directo';
  if (ASISTENTES.test(r)) return 'Asistente de IA';
  if (BUSCADORES.test(r)) return 'Buscador';
  if (WHATSAPP.test(r)) return 'WhatsApp';
  if (SOCIALES.test(r)) return 'Redes sociales';
  if (CORREO.test(r)) return 'Correo';
  return 'Otro sitio';
}

/** «google / cpc · campaña-colegios» o el dominio: lo que se enseña en la tabla. */
export function detalleDeOrigen(o: Origen | null): string {
  if (!o) return '—';
  const partes: string[] = [];
  if (o.us || o.um) partes.push([o.us, o.um].filter(Boolean).join(' / '));
  else if (o.r) partes.push(o.r);
  if (o.uc) partes.push(o.uc);
  if (o.g) partes.push('Google Ads');
  if (o.fb) partes.push('Meta Ads');
  if (o.ms) partes.push('Microsoft Ads');
  return partes.join(' · ') || '—';
}
