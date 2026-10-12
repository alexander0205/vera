'use client';

/**
 * Quién dijo ser el visitante — pyme o colegio — compartido por toda la página
 * de precios.
 *
 * Vivía dentro de `Planes`, que es donde se elige. El problema es que la banda
 * de cierre («Armemos tu plan juntos») se pinta MUY abajo, después de la tabla,
 * las preguntas y las tarjetas de contacto, y esas secciones son de servidor.
 * Un director que baja pulsando nada llegaba a esa banda y caía en el
 * formulario de una pyme, justo después de que las cuatro tarjetas le hubieran
 * dicho cinco veces «hablar con un representante».
 *
 * Un contexto y no un `?perfil=` en la URL: leer el parámetro obligaría a la
 * página a resolverse por petición y `/precios` es prerenderizada. Aquí el
 * servidor pinta las dos secciones y solo el enlace de la banda cambia al
 * elegir.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LlamadoFinal } from '../_piezas';

export type Perfil = 'pyme' | 'colegio';

type Valor = { perfil: Perfil; elegirPerfil: (p: Perfil) => void };

/**
 * Sin proveedor se comporta como una pyme y el selector no hace nada: es lo que
 * ya se veía antes de existir este contexto, así que ningún trozo suelto de la
 * página se rompe por quedarse fuera.
 */
const Ctx = createContext<Valor>({ perfil: 'pyme', elegirPerfil: () => {} });

export function PerfilProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil>('pyme');
  const elegirPerfil = useCallback((p: Perfil) => setPerfil(p), []);
  const valor = useMemo(() => ({ perfil, elegirPerfil }), [perfil, elegirPerfil]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePerfil() {
  return useContext(Ctx);
}

/**
 * La banda de cierre, que ahora sabe con quién está hablando.
 *
 * Al colegio se le ofrece lo mismo que las tarjetas —hablar con alguien— y se
 * le lleva el perfil puesto; a la pyme se le deja el texto de siempre, que
 * habla de su operación y no de estudiantes.
 */
export function CierreDePrecios() {
  const { perfil } = usePerfil();
  const esColegio = perfil === 'colegio';

  return (
    <LlamadoFinal
      titulo="Armemos tu plan juntos"
      detalle={
        esColegio
          ? '30 minutos con un especialista: vemos cuántos estudiantes tienes, qué hay que migrar y te dejamos el precio por escrito.'
          : '30 minutos con un especialista: vemos tu operación y te dejamos el presupuesto por escrito.'
      }
      accion={esColegio ? 'Hablar con un representante' : 'Solicitar demo'}
      href={esColegio ? '/contacto?perfil=colegio' : '/contacto'}
    />
  );
}
