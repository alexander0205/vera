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

/** Cómo queda anotado en `pagos_recibidos` el cobro que salió de un comprobante. */
export function notaDeComprobante(id: number): string {
  return `Comprobante #${id} aprobado`;
}

interface AvisoDeComprobante {
  estado: string;
  montoCentavos: number;
  montoAprobadoCentavos: number | null;
  /** Lo que entró a la factura del `?f=`. `null` en el enlace general. */
  aplicadoEnFacturaCentavos: number | null;
}

/**
 * El monto del aviso en la página del padre.
 *
 * En la página de una factura, solo lo que entró a esa factura: un comprobante
 * se reparte entre varias, y «Pago confirmado · RD$15,590» encima de una factura
 * que recibió RD$1,110 no cuadra con nada.
 */
export function montoDelAviso(c: AvisoDeComprobante): number {
  if (c.estado !== 'aprobado') return c.montoCentavos;
  return c.aplicadoEnFacturaCentavos ?? montoConfirmado(c);
}

/** Aprobado sin nada para esta factura: todo el dinero se fue a otra. */
export function seEnsenaElAviso(c: Pick<AvisoDeComprobante, 'estado' | 'aplicadoEnFacturaCentavos'>): boolean {
  return c.estado !== 'aprobado' || c.aplicadoEnFacturaCentavos !== 0;
}
