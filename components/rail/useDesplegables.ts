'use client';

/**
 * Un solo desplegable abierto a la vez, en los cuatro menús.
 *
 * Reglas, en una línea: se abre al dejar el puntero encima medio segundo o
 * con un clic; se cierra SOLO si lo cierras tú o si abres otro. Sacar el
 * ratón no cierra nada — cerrar por salir convierte el menú en un parpadeo
 * mientras bajas hacia el ítem que ibas a pulsar.
 *
 * Vive aquí y no dentro de cada rail a propósito: cuatro copias de la misma
 * máquina de estados es exactamente cómo divergen. Se arregla un fallo en una y
 * las otras tres se quedan con él.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DURACION_DESPLIEGUE_MS, RETARDO_HOVER_MS } from './estilos';

export interface Desplegables {
  /** Id del grupo abierto, o null si están todos cerrados. */
  grupoAbierto: string | null;
  /** Duración de la animación: 0 si el sistema pide menos movimiento. */
  duracion: number;
  /** Abre o cierra al instante (clic, Enter o Espacio sobre la cabecera). */
  alternar: (id: string) => void;
  /** Handlers de puntero para la caja del grupo (abrir por hover). */
  handlersPuntero: (id: string) => {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
  };
}

/** `grupoActivo` = el grupo del que cuelga la ruta actual, o null. */
export function useDesplegables(grupoActivo: string | null): Desplegables {
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(() => grupoActivo);

  // El grupo donde estás se abre solo, o el ítem en el que te encuentras
  // quedaría escondido dentro de un grupo cerrado. Depende de `grupoActivo` y
  // no de `pathname` porque los permisos llegan después del primer render y el
  // grupo puede aparecer tarde. Si la ruta nueva no cuelga de ningún grupo no
  // se cierra nada: lo que abriste sigue abierto.
  useEffect(() => {
    if (grupoActivo) setGrupoAbierto(grupoActivo);
  }, [grupoActivo]);

  // Solo puede haber una apertura en cola, la del grupo que tiene el puntero
  // encima ahora mismo.
  const pendienteRef = useRef<{ id: string; reloj: ReturnType<typeof setTimeout> } | null>(null);

  const cancelarPendiente = useCallback(() => {
    if (pendienteRef.current) clearTimeout(pendienteRef.current.reloj);
    pendienteRef.current = null;
  }, []);

  // Un reloj vivo después de desmontar intentaría tocar el estado de un
  // componente que ya no existe.
  useEffect(() => cancelarPendiente, [cancelarPendiente]);

  const programarApertura = useCallback((id: string) => {
    cancelarPendiente();
    const reloj = setTimeout(() => {
      pendienteRef.current = null;
      setGrupoAbierto(id);
    }, RETARDO_HOVER_MS);
    pendienteRef.current = { id, reloj };
  }, [cancelarPendiente]);

  // El clic es la vía rápida —no espera el medio segundo— y también la única
  // forma de cerrar. Enter y Espacio sobre el botón llegan aquí como clic, así
  // que el teclado abre y cierra igual que el ratón.
  const alternar = useCallback((id: string) => {
    cancelarPendiente();
    setGrupoAbierto(prev => (prev === id ? null : id));
  }, [cancelarPendiente]);

  const handlersPuntero = useCallback((id: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      // En táctil y con lápiz no existe "pasar por encima": ahí manda el tap,
      // que llega como click. Filtrar por pointerType evita que el menú se
      // abra solo al arrastrar el dedo por la pantalla.
      if (e.pointerType !== 'mouse' || grupoAbierto === id) return;
      programarApertura(id);
    },
    // Salir cancela la apertura EN COLA, nada más: lo que ya está abierto se
    // queda abierto.
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && pendienteRef.current?.id === id) cancelarPendiente();
    },
  }), [cancelarPendiente, programarApertura, grupoAbierto]);

  // Sin animación cuando el sistema pide menos movimiento.
  const sinMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)');

  return {
    grupoAbierto,
    duracion: sinMovimiento ? 0 : DURACION_DESPLIEGUE_MS,
    alternar,
    handlersPuntero,
  };
}
