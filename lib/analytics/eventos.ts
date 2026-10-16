/**
 * Eventos que la web pública le manda a Google Analytics, además de la vista
 * de página.
 *
 * Una sola puerta para todos, por dos razones:
 *  - Sin la etiqueta cargada (desarrollo, vistas previas, un bloqueador) no
 *    pasa nada: no hay que proteger cada llamada.
 *  - Lo que sale se recorta aquí: solo texto corto y números, nunca un correo,
 *    un nombre ni la query de la URL (que en dos pantallas lleva un secreto).
 *
 * Los nombres siguen la convención de GA4 (minúsculas y guion bajo) y, donde
 * Google tiene uno recomendado —`sign_up`, `generate_lead`—, se usa ese: GA lo
 * reconoce y lo puede marcar como evento clave sin configurar nada más.
 */

export type NombreEvento =
  | 'cta_click'          // clic en un botón o enlace que importa (ver `clasificarClic`)
  | 'sign_up'            // cuenta creada (param `method`: correo | google)
  | 'email_verified'     // abrió el enlace del correo de verificación
  | 'onboarding_step'    // llegó a un paso del alta (param `step`: 2 | 3 | 4)
  | 'onboarding_submit'  // pulsó «Empezar» en el último paso
  | 'generate_lead';     // envió el formulario de contacto

type Valor = string | number | boolean | undefined;

type Ventana = Window & { gtag?: (...args: unknown[]) => void };

const limpio = (v: Valor): string | number | boolean | undefined => {
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim().slice(0, 80);
    // Un correo no tiene por qué llegar aquí, pero si llega, no sale.
    return s && !/@[^\s]+\.[a-z]{2,}/i.test(s) ? s : undefined;
  }
  return v;
};

export function enviarEvento(nombre: NombreEvento, params: Record<string, Valor> = {}): void {
  if (typeof window === 'undefined') return;
  const salida: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    const x = limpio(v);
    if (x !== undefined) salida[k] = x;
  }
  // Al siguiente turno y no ya: un evento que se manda al montar la página
  // corre ANTES que el efecto del marco que configura la etiqueta (los hijos
  // montan primero), y un evento sin `config` delante se pierde.
  window.setTimeout(() => {
    const gtag = (window as Ventana).gtag;
    if (typeof gtag !== 'function') return;
    try { gtag('event', nombre, salida); } catch { /* la medición nunca rompe la página */ }
  }, 0);
}

export type TipoCta =
  | 'registro' | 'entrar' | 'contacto' | 'precios' | 'whatsapp' | 'correo' | 'telefono'
  | 'demo' | 'producto' | 'guia' | 'agentes' | 'externo';

/**
 * Qué clase de clic es, a partir del destino del enlace. `null` = no se mide
 * (navegación interna sin interés, anclas de la misma página).
 *
 * Por destino y no por botón: así se miden todos los «Empezar la prueba» de
 * todas las páginas sin tocar cada componente, y el que se añada mañana
 * también. El botón concreto lo dicen `cta_texto` y `cta_seccion`.
 */
export function clasificarClic(href: string, origenActual: string): TipoCta | null {
  if (!href) return null;
  const h = href.trim();
  if (h.startsWith('#') || h.startsWith('javascript:')) return null;
  if (/^mailto:/i.test(h)) return 'correo';
  if (/^tel:/i.test(h)) return 'telefono';
  let u: URL;
  try { u = new URL(h, origenActual); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/.test(host)) return 'whatsapp';
  const propio = /(^|\.)zero\.com\.do$/.test(host) || u.origin === new URL(origenActual).origin;
  if (!propio) return 'externo';
  const p = u.pathname;
  if (/^\/sign-up(\/|$)/.test(p)) return 'registro';
  if (/^\/sign-in(\/|$)/.test(p)) return 'entrar';
  if (/^\/contacto(\/|$)/.test(p)) return u.searchParams.get('perfil') === 'demo' ? 'demo' : 'contacto';
  if (/^\/precios(\/|$)/.test(p)) return 'precios';
  if (/^\/(productos|colegios)(\/|$)/.test(p)) return 'producto';
  if (/^\/guias(\/|$)/.test(p)) return 'guia';
  if (/^\/(agentes|funciones)(\.md)?(\/|$)/.test(p)) return 'agentes';
  return null;
}

/** El destino tal como se puede enviar: camino y, de la query, solo `perfil`. */
export function destinoMedible(href: string, origenActual: string): string {
  try {
    const u = new URL(href, origenActual);
    if (!/^https?:$/.test(u.protocol)) return u.protocol.replace(':', '');
    const propio = /(^|\.)zero\.com\.do$/.test(u.hostname) || u.origin === new URL(origenActual).origin;
    if (!propio) return u.hostname;
    const perfil = u.searchParams.get('perfil');
    return perfil ? `${u.pathname}?perfil=${perfil}` : u.pathname;
  } catch {
    return '';
  }
}
