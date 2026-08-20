'use client';

/**
 * "Atrás" que respeta el camino por el que llegó el usuario.
 *
 * Cada pantalla de detalle tenía su volver clavado a una ruta fija —la factura
 * siempre al listado de facturas—, así que quien abría una factura desde la
 * ficha de un estudiante terminaba en el listado, lejos del alumno que estaba
 * revisando. Ahora esas pantallas piden `useVolver(laRutaDeSiempre)`: se
 * retrocede en el historial cuando hay algo nuestro detrás, y la ruta de
 * siempre queda de respaldo para cuando no lo hay (enlace abierto directo,
 * pestaña nueva, llegada desde un correo).
 *
 * Cuánto se ha navegado se mide con un contador propio y NO con
 * `window.history.length`: esa cuenta arrastra las páginas de otros sitios que
 * pasaron por la pestaña, y con ella un `back()` podía sacar al usuario fuera
 * de la aplicación. El contador solo sube al cambiar de ruta estando ya
 * dentro, así que un valor ≥ 1 garantiza que la entrada anterior es nuestra.
 *
 * El contador vive fuera de React, en una variable de módulo, para que cambiar
 * de pantalla no obligue a re-renderizar media aplicación solo por llevar la
 * cuenta. Se lee únicamente dentro del callback del click, nunca durante el
 * render: el servidor no lo toca, no hay desajuste de hidratación y da igual
 * que en Node el módulo sea compartido entre peticiones.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

let navegacionesInternas = 0;

/**
 * Se monta una sola vez, en el layout raíz, y no pinta nada.
 *
 * Una recarga completa lo devuelve a cero aunque el historial siga teniendo
 * páginas nuestras: se pierde el atajo y se cae en la ruta de respaldo. Es el
 * error que preferimos — molesta menos que un "atrás" que te expulsa de la
 * aplicación.
 */
export function RastreadorDeNavegacion() {
  const pathname = usePathname();
  const primerRender = useRef(true);

  useEffect(() => {
    // La primera pasada es la llegada, no una navegación. Si contara, quien
    // abre un enlace directo arrancaría ya en 1 y el back() lo sacaría de la
    // aplicación, que es justo lo que queremos evitar.
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    navegacionesInternas += 1;
  }, [pathname]);

  return null;
}

/**
 * Devuelve el manejador del botón de volver. `fallback` es la ruta a la que se
 * cae cuando no hay historial propio: la misma que la pantalla usaba antes, y
 * la que sigue describiendo la etiqueta visible.
 */
export function useVolver(fallback: string): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (navegacionesInternas > 0) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
