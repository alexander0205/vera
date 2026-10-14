'use client';

import { useEffect, useState } from 'react';

/** Ancho de la columna del asistente cuando está anclada. */
export const ANCHO_ANCLADO = 420;
/** Por debajo de esto no hay sitio para página + columna: el panel flota encima. */
const MINIMO_PARA_ANCLAR = 1100;

/**
 * Panel fijo al lado de la pantalla: mientras está abierto y la ventana es lo
 * bastante ancha, el `body` reserva su ancho a la derecha. La página (que mide
 * el 100 % del `body`) se encoge en vez de quedar tapada.
 *
 * Es una reserva en el `body`, no un cambio en cada layout: sirve igual en
 * Facturación, POS, Escolar, Nómina y Contabilidad, que comparten el `body`.
 */
export function useAnclado(abierto: boolean): boolean {
  const [ancho, setAncho] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MINIMO_PARA_ANCLAR}px)`);
    const actualizar = () => setAncho(mq.matches);
    actualizar();
    mq.addEventListener('change', actualizar);
    return () => mq.removeEventListener('change', actualizar);
  }, []);

  const anclado = abierto && ancho;

  useEffect(() => {
    if (!anclado) return;
    const body = document.body;
    const antes = { padding: body.style.paddingRight, transicion: body.style.transition };
    body.style.transition = 'padding-right .18s ease-out';
    body.style.paddingRight = `${ANCHO_ANCLADO}px`;
    document.documentElement.dataset.asistente = 'anclado';
    // Los componentes que miden la ventana (gráficas, tablas) se reajustan al resize.
    window.dispatchEvent(new Event('resize'));
    return () => {
      body.style.paddingRight = antes.padding;
      body.style.transition = antes.transicion;
      delete document.documentElement.dataset.asistente;
      window.dispatchEvent(new Event('resize'));
    };
  }, [anclado]);

  return anclado;
}
