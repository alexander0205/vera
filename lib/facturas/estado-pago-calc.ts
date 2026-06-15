/**
 * Cálculo PURO del estado_pago — sin dependencias de DB.
 *
 * Vive aparte de estado-pago.ts (que importa la DB) para poder usarse también
 * en componentes 'use client' (p.ej. el listado de facturas), garantizando que
 * listado y detalle deriven el estado con la MISMA lógica y nunca discrepen por
 * una columna estado_pago persistida desactualizada.
 */

export type EstadoPago =
  | 'PENDIENTE'
  | 'PARCIAL'
  | 'PAGADA'
  | 'ANULADA'
  | 'GRATUITA'
  | 'USO';

export function calcularEstadoPago(params: {
  estado:      string;
  tipoPago:    number | null | undefined;
  montoTotal:  number;        // centavos
  totalPagado: number;        // centavos sumados de pagos_recibidos
}): EstadoPago {
  if (params.estado === 'ANULADO') return 'ANULADA';
  if (params.tipoPago === 3)       return 'GRATUITA';
  if (params.tipoPago === 4)       return 'USO';
  // Pago real determina el estado para TODOS los tipos (contado y crédito).
  // No se asume contado=pagado: un contado emitido sin registrar pago tiene
  // saldo pendiente y debe aparecer en cuentas por cobrar.
  if (params.montoTotal > 0 && params.totalPagado >= params.montoTotal) return 'PAGADA';
  if (params.totalPagado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}
