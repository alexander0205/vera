'use client';

/**
 * Estado de interfaz que vive en la URL en vez de en `useState`.
 *
 * Nació en la ficha del estudiante para las pestañas y lo usa también el
 * listado para sus filtros y para el alumno seleccionado. Está aquí, y no
 * copiado en cada pantalla, porque las dos reglas que lo hacen funcionar
 * —`replace` y no escribir el valor por defecto— se olvidan en cuanto alguien
 * reescribe el mecanismo a mano.
 *
 * Siempre `router.replace`: elegir una fila, teclear en un filtro o cambiar de
 * pestaña no es navegar. Con `push`, salir de la pantalla obligaba a deshacer
 * clic por clic todo lo que el usuario hubiera tocado antes.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Lo que se puede escribir en la query. `null` (o cadena vacía) borra el parámetro. */
type Cambios = Record<string, string | number | null>;

/**
 * Lectura y escritura de la query de la pantalla.
 *
 * `setParams` acepta VARIOS parámetros de golpe a propósito: casi todos los
 * cambios son dos cosas a la vez —cambiar un filtro es también volver a la
 * página 1— y hacerlo en dos llamadas seguidas perdía una, porque las dos
 * partían de la misma query de este render y la segunda pisaba a la primera.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // La cadena y no el objeto: `useSearchParams` devuelve una instancia distinta
  // en cada render, y como dependencia de los `useCallback` de abajo dejaba los
  // manejadores nuevos siempre, que dentro de un efecto ajeno es un bucle.
  const qs = params.toString();

  const setParams = useCallback((cambios: Cambios) => {
    const p = new URLSearchParams(qs);
    for (const [clave, valor] of Object.entries(cambios)) {
      const v = valor == null ? '' : String(valor);
      if (v === '') p.delete(clave);
      else p.set(clave, v);
    }
    const nuevo = p.toString();
    // Sin cambio real no se toca el router: un `replace` por render mientras se
    // escribe en un filtro es tráfico de navegación para dejar todo igual.
    if (nuevo === qs) return;
    router.replace(nuevo ? `${pathname}?${nuevo}` : pathname, { scroll: false });
  }, [router, pathname, qs]);

  return { params, setParams } as const;
}

/**
 * Una pestaña —o cualquier valor de una lista cerrada— que vive en la URL.
 *
 * Es lo que hace que recargar, compartir el enlace o volver desde una factura
 * caiga donde el usuario estaba y no siempre en la primera pestaña.
 *
 * `valores` tiene que ser estable entre renders (constante de módulo o
 * `useMemo`): entra en las dependencias del `set` que devuelve.
 */
export function useTabUrl<T extends string>(param: string, valores: readonly T[], porDefecto: T) {
  const { params, setParams } = useUrlParams();
  const crudo = params.get(param);
  const valor = (valores as readonly string[]).includes(crudo ?? '') ? (crudo as T) : porDefecto;

  const set = useCallback((v: string) => {
    const valido = (valores as readonly string[]).includes(v) ? v : porDefecto;
    // El valor por defecto no se escribe: deja la URL limpia en el caso normal.
    setParams({ [param]: valido === porDefecto ? null : valido });
  }, [setParams, param, porDefecto, valores]);

  return [valor, set] as const;
}
