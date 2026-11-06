/**
 * Factura de origen de una nota de débito/crédito.
 *
 * El vínculo vive en dos columnas: `origen_documento_id` (notas creadas desde el
 * formulario) y `mora_origen_id` (notas de débito por mora, que genera el
 * cron o el menú del cargo y nunca llenan la primera). Para mostrar «Factura de
 * origen» al editar hay que mirar las dos.
 */
export function origenIdDeNota(doc: {
  origenDocumentoId?: number | null;
  moraOrigenId?: number | null;
}): number | null {
  return doc.origenDocumentoId ?? doc.moraOrigenId ?? null;
}
