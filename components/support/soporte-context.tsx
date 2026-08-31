'use client';

/**
 * Estado abierto/cerrado del panel de soporte, compartido.
 *
 * Antes vivía dentro de `TicketWidget` como un `useState`, y por eso el único
 * modo de abrirlo era su propio botón flotante: nadie más podía verlo ni
 * tocarlo. Al mover el disparador a la barra superior hacen falta dos piezas
 * que se hablen —el botón del header y el panel, que están en ramas distintas
 * del árbol—, así que el estado sube acá.
 *
 * El panel NO se desmonta al cerrarse: se esconde. La conversación, la llamada
 * y lo que estés escribiendo siguen vivos hasta que cierres el ticket, no
 * hasta que cierres la ventanita.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Dónde no va el soporte: páginas de impresión (van a papel, no a alguien
 * mirando) y la consola de agentes (son el equipo de soporte, no un cliente).
 * Estaba en el gate del widget; sube acá para que el BOTÓN respete la misma
 * lista — si no, en esas rutas habría un botón que no abre nada.
 */
const PREFIJOS_EXCLUIDOS = ['/pos-reporte', '/pos-ticket', '/zero-tickets', '/dashboard/soporte'];

interface Soporte {
  /** El panel está a la vista. */
  abierto: boolean;
  /** En esta ruta el soporte tiene sentido. */
  disponible: boolean;
  abrir: () => void;
  cerrar: () => void;
  alternar: () => void;
}

const SoporteContext = createContext<Soporte | null>(null);

export function SoporteProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  const disponible = !PREFIJOS_EXCLUIDOS.some((p) => pathname?.startsWith(p));

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);
  const alternar = useCallback(() => setAbierto((v) => !v), []);

  const valor = useMemo<Soporte>(
    () => ({ abierto: abierto && disponible, disponible, abrir, cerrar, alternar }),
    [abierto, disponible, abrir, cerrar, alternar],
  );

  return <SoporteContext.Provider value={valor}>{children}</SoporteContext.Provider>;
}

/**
 * Devuelve `null` fuera del provider en vez de lanzar: el header se usa en
 * pantallas sueltas (impresión, onboarding) que no lo montan, y ahí lo correcto
 * es que el botón no aparezca, no que reviente la página entera.
 */
export function useSoporte(): Soporte | null {
  return useContext(SoporteContext);
}
