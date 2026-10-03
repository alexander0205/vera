/**
 * Transparencia neutra del vínculo cargo↔factura. Devuelve la cobertura SIN
 * interpretarla: un hueco factura<cargo puede ser un descuento acordado o la
 * factura equivocada — el sistema no lo decide, lo muestra y lo revisa una
 * persona. Una rebaja real sería una acción explícita aparte (con motivo),
 * no un número auto-interpretado.
 *
 * Reglas:
 * - factura MÁS CHICA que el cargo → «sin cubrir RD$X» (aunque esté pagada).
 * - factura que cubre pero aún NO saldada (estadoPago ≠ PAGADA) → «pendiente de saldar».
 * - cuadrada y pagada, o sin factura vinculada → nada.
 *
 * Usa el monto TOTAL de la factura: una factura que cubre varios cargos es más
 * grande que un cargo suelto, así que nunca marca «sin cubrir» falso.
 */
export type CoberturaVinculo =
  | { tipo: 'sin-cubrir'; sinCubrirCentavos: number }
  | { tipo: 'pendiente' }
  | { tipo: 'ok' };

export function coberturaVinculo(c: {
  ecfDocumentId: number | null;
  montoCentavos: number;
  facturaMontoCentavos: number | null;
  facturaEstadoPago: string | null;
}): CoberturaVinculo {
  if (c.ecfDocumentId == null) return { tipo: 'ok' };
  const sinCubrir = c.facturaMontoCentavos != null
    ? Math.max(0, c.montoCentavos - c.facturaMontoCentavos)
    : 0;
  if (sinCubrir > 0) return { tipo: 'sin-cubrir', sinCubrirCentavos: sinCubrir };
  if (c.facturaEstadoPago !== 'PAGADA') return { tipo: 'pendiente' };
  return { tipo: 'ok' };
}
