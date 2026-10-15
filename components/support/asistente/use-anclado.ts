'use client';

import { useEffect, useState } from 'react';

/** Ancho de la columna del asistente cuando está anclada. */
export const ANCHO_ANCLADO = 420;
/** Ancho con el modo amplio (tablas y gráficos con más aire). */
export const ANCHO_AMPLIO = 640;
/** Lo que debe quedarle a la página al lado de la columna; con menos, el panel flota encima. */
export const ANCHO_MINIMO_DE_PAGINA = 680;

/** Ventana mínima para anclar una columna de ese ancho. */
export const minimoParaAnclar = (ancho: number) => ancho + ANCHO_MINIMO_DE_PAGINA;

/**
 * Panel fijo al lado de la pantalla: mientras está abierto y la ventana es lo
 * bastante ancha, el `body` reserva su ancho a la derecha. La página (que mide
 * el 100 % del `body`) se encoge en vez de quedar tapada.
 *
 * Es una reserva en el `body`, no un cambio en cada layout: sirve igual en
 * Facturación, POS, Escolar, Nómina y Contabilidad, que comparten el `body`.
 */
export function useAnclado(abierto: boolean, anchoColumna: number = ANCHO_ANCLADO): boolean {
  const [hayLugar, setHayLugar] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minimoParaAnclar(anchoColumna)}px)`);
    const actualizar = () => setHayLugar(mq.matches);
    actualizar();
    mq.addEventListener('change', actualizar);
    return () => mq.removeEventListener('change', actualizar);
  }, [anchoColumna]);

  const anclado = abierto && hayLugar;

  useEffect(() => {
    if (!anclado) return;
    const body = document.body;
    const antes = { padding: body.style.paddingRight, transicion: body.style.transition };
    body.style.transition = 'padding-right .18s ease-out';
    body.style.paddingRight = `${anchoColumna}px`;
    document.documentElement.dataset.asistente = 'anclado';
    // Los componentes que miden la ventana (gráficas, tablas) se reajustan al resize.
    window.dispatchEvent(new Event('resize'));
    return () => {
      body.style.paddingRight = antes.padding;
      body.style.transition = antes.transicion;
      delete document.documentElement.dataset.asistente;
      window.dispatchEvent(new Event('resize'));
    };
  }, [anclado, anchoColumna]);

  return anclado;
}
