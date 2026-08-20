'use client';

/**
 * El widget vive en el layout raíz para estar en todas las rutas, pero
 * no tiene sentido en: páginas de impresión (van a PDF/impresora, no
 * a un usuario mirando pantalla) ni en la consola de agentes de
 * zero-tickets (el propio equipo de soporte, no un cliente).
 */

import { usePathname } from 'next/navigation';
import { TicketWidget } from './ticket-widget';

const PREFIJOS_EXCLUIDOS = ['/pos-reporte', '/pos-ticket', '/zero-tickets', '/dashboard/soporte'];

export function TicketWidgetGate() {
  const pathname = usePathname();
  if (PREFIJOS_EXCLUIDOS.some((p) => pathname?.startsWith(p))) return null;
  return <TicketWidget />;
}
