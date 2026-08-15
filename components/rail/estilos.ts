/**
 * Constantes visuales del menú lateral — las MISMAS para los cuatro módulos.
 *
 * Antes cada rail traía su copia de estos números (y de la escala de color), así
 * que el rediseño de Facturación dejó a los otros tres con el diseño viejo: el
 * texto en 15px, el ancho abierto en 224 y el blanco plano de siempre. Ahora
 * viven aquí y los cuatro los importan; cambiar un tono es cambiar un archivo.
 */

/** Ancho del rail abierto. 224 se quedaba corto: "Balance de comprobación" y
 *  "Activar facturación electrónica" salían cortados. */
export const ANCHO_ABIERTO = 264;

/** Ancho colapsado (solo iconos). */
export const ANCHO_RAIL = 68;

/** Azul de marca del rail. */
export const FONDO_RAIL = '#2a45c4';

/**
 * Escala gris→blanco del menú. Antes todo el texto era blanco casi puro y la
 * barra azul se veía maciza; ahora el peso lo pone la tipografía y el color se
 * limita a marcar jerarquía: en reposo gris, al pasar por encima casi blanco,
 * y blanco puro solo donde estás. Los iconos son de lucide y pintan con
 * `currentColor`, así que siguen la misma escala sin tocarlos.
 */
export const TINTA = {
  reposo: 'rgba(203,213,225,0.72)',
  hover:  'rgba(248,250,252,0.96)',
  activa: '#ffffff',
  tenue:  'rgba(203,213,225,0.5)',   // rótulos, atajos y metadatos
};

/** Sora (la tipografía de marca) para las secciones: a 14px con peso 600 marca
 *  mucho más que Inter y le da al menú el aire de barra de aplicación. Los
 *  hijos se quedan en Inter, que aguanta mejor las listas largas. */
export const FUENTE_SECCION = {
  fontFamily:    'var(--font-display)',
  fontSize:      '0.875rem',
  letterSpacing: '-0.005em',
};

/** Cuánto hay que dejar el puntero encima de un grupo para que se despliegue.
 *  Medio segundo es muchísimo más de lo que dura cruzar el menú en diagonal
 *  hacia un ítem de más abajo, así que de camino no se abre nada. */
export const RETARDO_HOVER_MS = 500;

/** Apertura del submenú. Por debajo de 200ms se percibe como un salto y por
 *  encima de 350ms se hace lenta; el chevron gira con esta misma duración para
 *  que no vayan a destiempo. */
export const DURACION_DESPLIEGUE_MS = 240;
export const CURVA_DESPLIEGUE = 'cubic-bezier(0.25, 0.8, 0.3, 1)'; // salida suave
