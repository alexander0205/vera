/**
 * Con qué RNC y a qué nombre sale la factura.
 *
 * No es lo mismo que «a quién se le factura». El contacto es una persona de la
 * agenda; el RNC del comprobante es un dato del comprobante, y la base lo
 * guarda aparte por eso mismo (`ecf_documents.client_id` vs `rnc_comprador` /
 * `razon_social_comprador`).
 *
 * En un colegio los dos se separan constantemente: el padre paga la
 * colegiatura de su hijo y pide la factura a nombre de su empresa, para
 * deducirla. La familia es la misma —el cargo, el alumno y el cobro siguen
 * colgando del responsable de pago— y lo único que cambia es el RNC que va
 * impreso.
 *
 * Antes esto era `clienteSeleccionado?.rnc ?? rncManual` repetido en tres
 * sitios, y con un contacto elegido el RNC escrito se descartaba en silencio:
 * el buscador de RNC seguía ahí, se podía usar, y no hacía nada. Ahora manda lo
 * que se escribió y el contacto es solo el valor por defecto — que además ya
 * viene sembrado en `rncManual` al elegirlo, así que en el caso corriente los
 * dos dicen lo mismo.
 */

export interface CompradorFinal {
  rnc: string;
  razonSocial: string;
}

export function datosComprador(
  clienteSeleccionado: { rnc: string | null; razonSocial: string } | null,
  rncManual: string,
  rncManualNombre: string,
): CompradorFinal {
  return {
    rnc: rncManual.trim() || clienteSeleccionado?.rnc?.trim() || '',
    razonSocial: rncManualNombre.trim() || clienteSeleccionado?.razonSocial?.trim() || '',
  };
}
