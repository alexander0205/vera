'use client';

/**
 * Aparición suave al bajar: opacidad y diez píxeles de subida, una vez.
 *
 * Tres reglas, porque cada una ya costó algo en otro sitio:
 *
 *  - **Sin JavaScript se ve todo.** El servidor lo pinta visible; solo el
 *    cliente, ya montado, esconde lo que todavía no está en pantalla. Un sitio
 *    que depende de un script para enseñar su texto es un sitio en blanco para
 *    el buscador que no lo ejecuta y para el teléfono lento.
 *  - **Lo que ya se ve al cargar no se toca.** Esconder el hero para luego
 *    enseñarlo es un parpadeo, y en la portada además retrasa el LCP.
 *  - **Con «menos movimiento» no se mueve nada.** Lo decide el sistema del que
 *    mira, no nosotros.
 *
 * Un solo observador por elemento y se suelta al primer cruce: no hay nada
 * que vuelva a esconderse al subir.
 */

import { useEffect, useRef, useState } from 'react';

type Estado = 'quieto' | 'espera' | 'visto';

export function AlVer({
  children, retraso = 0, className = '', como: Etiqueta = 'div',
}: {
  children: React.ReactNode;
  /** Milisegundos: para escalonar piezas de un mismo bloque. */
  retraso?: number;
  className?: string;
  como?: 'div' | 'li' | 'section';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [estado, setEstado] = useState<Estado>('quieto');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Ya en pantalla al montar: se queda como vino del servidor.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    setEstado('espera');
    const observador = new IntersectionObserver(
      entradas => {
        if (entradas.some(e => e.isIntersecting)) {
          setEstado('visto');
          observador.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <Etiqueta
      ref={ref as React.Ref<never>}
      data-al-ver={estado === 'quieto' ? undefined : estado}
      style={retraso ? ({ '--al-ver-retraso': `${retraso}ms` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </Etiqueta>
  );
}
