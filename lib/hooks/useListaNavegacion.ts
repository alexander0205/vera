'use client';

/**
 * Recorrer una lista desde el detalle: «2 de 548» con flechas ‹ ›.
 *
 * La gracia es que las flechas siguen la lista de la que VINISTE —con su filtro
 * y su orden—, no todos los documentos de la empresa. Si filtraste «vencidas de
 * agosto», recorres esas; un contador global sería un número sin significado.
 *
 * Se guarda en `sessionStorage` y no en la URL para no ensuciar los enlaces que
 * la gente copia y pega. Por sesión de pestaña: al cerrarla desaparece, que es
 * exactamente lo que se espera de un contexto de navegación.
 *
 * Si entraste por link directo, el id no está en la lista guardada y no se
 * muestra nada — mejor eso que unas flechas que saltan a documentos al azar.
 */

import { useEffect, useMemo, useState } from 'react';

const CLAVE = 'zero:lista-nav';
/** Techo por si alguien pide 5,000 filas: guardar todo llenaría el storage. */
const MAX_IDS = 2000;

interface ListaGuardada {
  /** Ruta del detalle, p.ej. '/dashboard/facturas'. Evita que la lista de
   *  cotizaciones haga navegar entre facturas. */
  base: string;
  ids:  number[];
}

/** Lo llama la LISTA cada vez que cambia lo que se ve en pantalla. */
export function guardarListaNavegacion(base: string, ids: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    const datos: ListaGuardada = { base, ids: ids.slice(0, MAX_IDS) };
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Storage lleno o bloqueado: el contador simplemente no aparece.
  }
}

export interface NavegacionLista {
  posicion: number;        // 1-based
  total:    number;
  anteriorId: number | null;
  siguienteId: number | null;
}

/** Lo llama el DETALLE. Devuelve null si este id no vino de una lista. */
export function useListaNavegacion(base: string, idActual: number): NavegacionLista | null {
  const [ids, setIds] = useState<number[] | null>(null);

  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem(CLAVE);
      if (!crudo) return;
      const datos = JSON.parse(crudo) as ListaGuardada;
      if (datos?.base === base && Array.isArray(datos.ids)) setIds(datos.ids);
    } catch {
      setIds(null);
    }
  }, [base]);

  return useMemo(() => {
    if (!ids) return null;
    const i = ids.indexOf(idActual);
    // El id no está en la lista: link directo, o la lista cambió de filtro
    // después. En ambos casos navegar sería mentir sobre dónde estás.
    if (i === -1) return null;
    return {
      posicion:    i + 1,
      total:       ids.length,
      anteriorId:  i > 0 ? ids[i - 1] : null,
      siguienteId: i < ids.length - 1 ? ids[i + 1] : null,
    };
  }, [ids, idActual]);
}
