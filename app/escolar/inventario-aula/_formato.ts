/** Formato y colores compartidos por las pantallas del inventario por aula. */

import type { EstadoVisible } from '@/lib/escolar/inventario-aula';

export const fmtDOP = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Sin centavos: para las tarjetas de arriba, donde se lee de un vistazo. */
export const fmtDOPCorto = (cents: number) =>
  `RD$${Math.round(cents / 100).toLocaleString('es-DO')}`;

export const fmtNumero = (n: number) => n.toLocaleString('es-DO');

/** Fondo y letra de cada estado. */
export const COLOR_ESTADO: Record<EstadoVisible, { bg: string; fg: string }> = {
  bien: { bg: '#dcfce7', fg: '#166534' },
  regular: { bg: '#f3f4f6', fg: '#374151' },
  reponer: { bg: '#fef3c7', fg: '#92400e' },
  danado: { bg: '#fee2e2', fg: '#991b1b' },
};

/** Pesos en texto → centavos enteros, sin el error de coma flotante de ×100. */
export function aCentavos(pesos: string): number {
  const n = parseFloat(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
