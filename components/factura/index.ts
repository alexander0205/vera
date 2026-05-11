/** Barrel: exporta todos los componentes de factura. */
export {
  FacturaHeader,
  FacturaItems,
  FacturaFooter,
  FacturaMessages,
  FacturaForm,
  FacturaPreview,
  ClienteSearch,
} from './form';

export { FacturasList } from './facturas-list';

// Re-export del Provider para que Lite/Full importen todo desde un solo lugar
export { FacturaProvider, useFactura } from '@/lib/factura/form';
