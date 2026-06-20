/**
 * Detalle dedicado de NOTA DE CRÉDITO (e34). Reusa el componente de detalle de
 * factura con variant="nota-credito": misma lógica (carga, emisión, anulación,
 * pagos), navegación y nomenclatura propias de NC.
 */
import { DocumentoDetalle } from '@/app/(dashboard)/dashboard/facturas/[id]/page';

export default function NotaCreditoDetallePage() {
  return <DocumentoDetalle variant="nota-credito" />;
}
