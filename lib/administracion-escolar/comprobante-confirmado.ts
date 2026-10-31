/**
 * Cuánto confirmó el colegio de un comprobante. La familia declara un monto y
 * quien aprueba puede corregirlo mirando el papel del banco: enseñar lo declarado
 * como «Pago confirmado» le dice a un padre que pagó lo que no pagó.
 *
 * Sin dato (un comprobante aprobado sin cobro asociado), lo declarado.
 */
export function montoConfirmado(c: { montoCentavos: number; montoAprobadoCentavos: number | null }): number {
  return c.montoAprobadoCentavos ?? c.montoCentavos;
}
