'use client';

/**
 * Mide los clics que importan de la web pública: registrarse, entrar,
 * contacto, precios, WhatsApp, correo, teléfono, productos y guías.
 *
 * Un solo oyente en el documento en vez de un `onClick` en cada botón: así se
 * miden todos los «Empezar la prueba» de todas las páginas, y el que se añada
 * mañana también, sin tocarlo. Qué es cada clic lo decide el destino del
 * enlace (`clasificarClic`); de dónde salió lo dicen el texto del botón y la
 * sección de la página.
 *
 * Un elemento puede pedir su propio nombre con `data-evento="..."` (por
 * ejemplo un botón que no es enlace).
 */

import { useEffect } from 'react';
import { clasificarClic, destinoMedible, enviarEvento } from '@/lib/analytics/eventos';
import { caminoMedible } from '@/lib/config/analytics';

export function MedirClics() {
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      try {
        if (!caminoMedible(window.location.pathname)) return;
        const objetivo = (e.target as Element | null)?.closest?.('a[href], [data-evento]');
        if (!objetivo) return;
        const propio = objetivo.getAttribute('data-evento');
        const href = objetivo.getAttribute('href') ?? '';
        const tipo = propio ?? clasificarClic(href, window.location.href);
        if (!tipo) return;
        const seccion = objetivo.closest('section[id], header, footer, nav');
        enviarEvento('cta_click', {
          cta_tipo: tipo,
          cta_texto: (objetivo.textContent ?? objetivo.getAttribute('aria-label') ?? '').slice(0, 60),
          cta_destino: href ? destinoMedible(href, window.location.href) : undefined,
          cta_seccion: seccion ? (seccion.id || seccion.tagName.toLowerCase()) : undefined,
          page_path: window.location.pathname,
        });
      } catch { /* la medición nunca rompe la página */ }
    };
    // En captura: llega aunque el componente del botón pare la propagación.
    document.addEventListener('click', alClic, true);
    return () => document.removeEventListener('click', alClic, true);
  }, []);
  return null;
}
