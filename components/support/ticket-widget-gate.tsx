'use client';

/**
 * El widget vive en el layout raíz para estar en todas las rutas, pero
 * no tiene sentido en: páginas de impresión (van a PDF/impresora, no
 * a un usuario mirando pantalla) ni en la consola de agentes de
 * zero-tickets (el propio equipo de soporte, no un cliente).
 */

import { TicketWidget } from './ticket-widget';
import { useSoporte } from './soporte-context';

export function TicketWidgetGate() {
  // La lista de rutas excluidas se mudó a `soporte-context`: la necesitan el
  // panel Y el botón de la barra superior, y tenerla en dos sitios era pedir
  // que se desincronizaran.
  const soporte = useSoporte();
  if (!soporte?.disponible) return null;
  return <TicketWidget />;
}
