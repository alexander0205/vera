/**
 * Cómo se nombra la factura de origen en el detalle de una nota de débito o
 * de crédito: por su e-NCF real, que es lo que la nota modifica ante la DGII.
 *
 * `encf` guarda el e-NCF (E31…) o, mientras es borrador, un marcador `BOR-…`
 * que no es un comprobante. Solo el real manda; sin él se cae al código interno
 * (`FA-…`) y, a falta de ambos, al marcador.
 */
export function etiquetaFacturaOrigen(origen: { codigo: string | null; encf: string | null }): string {
  const encf = (origen.encf ?? '').trim();
  if (/^E\d{10,12}$/.test(encf)) return encf;
  return origen.codigo?.trim() || encf;
}
