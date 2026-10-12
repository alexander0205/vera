/**
 * Forma de una lista de menú lateral. Común a los cuatro módulos: lo único que
 * cambia de un rail a otro son las secciones que le pasa, no cómo se pintan.
 */

import type { ElementType } from 'react';

/** Entrada dentro de un desplegable. */
export interface RailHijo {
  href: string;
  label: string;
  /** Atajo "+" que aparece al pasar el mouse (crear uno nuevo). */
  plusHref?: string;
  /** Marca "Compartido": la misma entidad que ve otro módulo. */
  shared?: boolean;
}

/** Sección que lleva directo a una pantalla. */
export interface RailItem {
  /** Identifica la sección para el orden por uso. DEBE ser único entre módulos:
   *  los contadores viven en un solo localStorage, así que un 'configuracion' a
   *  secas mezclaría las visitas de POS con las de Facturación. */
  id: string;
  href: string;
  icon: ElementType;
  label: string;
  /** Activa solo con la ruta exacta (para las raíces tipo /dashboard o /pos). */
  exact?: boolean;
  shared?: boolean;
}

/** Sección con desplegable. */
export interface RailGrupo {
  id: string;
  label: string;
  icon: ElementType;
  children: RailHijo[];
}

/** Una entrada de la lista reordenable: o lleva a un sitio, o abre un submenú.
 *  Las dos cuentan visitas y las dos pueden cambiar de sitio con el uso. */
export type RailSeccion =
  | ({ tipo: 'item' } & RailItem)
  | ({ tipo: 'grupo' } & RailGrupo);
