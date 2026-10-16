'use client';

/**
 * Apunta de dónde llegó la persona en su PRIMERA visita a la web pública.
 *
 * Escribe la cookie `zero_origen` una sola vez (ver `lib/analytics/origen.ts`)
 * con dominio `.zero.com.do`, para que la lea el alta en `app.zero.com.do`
 * aunque la visita haya entrado por `www`. No depende de Google Analytics: con
 * la etiqueta bloqueada, el registro igual sabe de dónde vino.
 *
 * Se monta en los mismos marcos que la etiqueta —marketing, legales y acceso—
 * y nunca en una ruta con secreto (`caminoMedible`).
 */

import { useEffect } from 'react';
import { caminoMedible } from '@/lib/config/analytics';
import { COOKIE_ORIGEN, VIDA_COOKIE_ORIGEN_S, escribirOrigen, origenDeVisita } from '@/lib/analytics/origen';

export function CapturaOrigen() {
  useEffect(() => {
    try {
      if (!caminoMedible(window.location.pathname)) return;
      if (document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_ORIGEN}=`))) return;
      const hoy = new Date().toISOString().slice(0, 10);
      const origen = origenDeVisita(new URL(window.location.href), document.referrer, hoy);
      const dominio = /(^|\.)zero\.com\.do$/.test(window.location.hostname) ? '; domain=.zero.com.do' : '';
      const seguro = window.location.protocol === 'https:' ? '; secure' : '';
      document.cookie = `${COOKIE_ORIGEN}=${escribirOrigen(origen)}; path=/; max-age=${VIDA_COOKIE_ORIGEN_S}; samesite=lax${dominio}${seguro}`;
    } catch { /* la medición nunca rompe la página */ }
  }, []);
  return null;
}
