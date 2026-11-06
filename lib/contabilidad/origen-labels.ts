/** Cómo se llama, en lenguaje de usuario, lo que originó un asiento. Lo comparten el libro diario y el libro banco. */
export const ORIGEN_LABEL: Record<string, string> = {
  factura: 'Factura',
  pago: 'Cobro',
  nota: 'Nota de crédito',
  anulacion: 'Anulación',
  manual: 'Manual',
  compra: 'Compra',
  gasto_caja: 'Gasto de caja',
  gasto_doc: 'Gasto',
  depreciacion: 'Depreciación',
  compra_anulada: 'Compra anulada',
  pago_proveedor: 'Pago a proveedor',
  cierre: 'Cierre de ejercicio',
  nomina: 'Nómina',
  provision_nomina: 'Provisión de nómina',
  pago_sueldos: 'Pago de sueldos',
  pago_nomina: 'Pago TSS / DGII',
  activo_compra: 'Compra de activo fijo',
  ajuste_inventario: 'Ajuste de inventario',
  costo_venta: 'Costo de ventas',
};

/** La etiqueta de un origen; si no se conoce, el nombre «humanizado» (nunca la clave cruda). */
export const etiquetaOrigen = (origen: string): string => {
  if (ORIGEN_LABEL[origen]) return ORIGEN_LABEL[origen];
  const t = origen.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Otro';
};
