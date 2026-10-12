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
  /** Centavos acreditados por Notas de Crédito (tipo 34) vinculadas al doc. */
  totalNotasCredito?: number;
  /**
   * Centavos que la empresa retiene y entrega a la DGII: el documento se salda
   * con el neto. Pasar `retencionesQueSaldan(tipoEcf, total_retenciones)`.
   */
  totalRetenciones?: number;
}): EstadoPago {
  if (params.estado === 'ANULADO') return 'ANULADA';
  if (params.tipoPago === 3)       return 'GRATUITA';
  if (params.tipoPago === 4)       return 'USO';
  // Pago real determina el estado para TODOS los tipos (contado y crédito).
  // No se asume contado=pagado: un contado emitido sin registrar pago tiene
  // saldo pendiente y debe aparecer en cuentas por cobrar.
  // Las NC vinculadas acreditan contra el total igual que un pago.
  const aplicado = params.totalPagado + (params.totalNotasCredito ?? 0);
  const aSaldar = Math.max(0, params.montoTotal - (params.totalRetenciones ?? 0));
  if (params.montoTotal > 0 && aplicado >= aSaldar) return 'PAGADA';
  if (aplicado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

/**
 * En compras a informales (41), gastos menores (43) y pagos al exterior (47)
 * quien retiene es la empresa: al proveedor se le paga el neto y lo retenido va
 * a la DGII (IR-17 / IT-1). Sin descontarlo, un gasto pagado completo quedaba
 * «Parcial» para siempre. Las ventas no se tocan: su cartera calcula el saldo
 * sobre el total.
 */
export function retencionesQueSaldan(tipoEcf: string | null | undefined, totalRetenciones: number | null | undefined): number {
  return tipoEcf === '41' || tipoEcf === '43' || tipoEcf === '47' ? Number(totalRetenciones ?? 0) : 0;
}
