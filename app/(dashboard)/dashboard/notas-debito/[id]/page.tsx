/**
 * Detalle dedicado de NOTA DE DÉBITO (e33). Reusa el componente de detalle de
 * factura con variant="nota-debito": misma lógica (carga, emisión, anulación,
 * pagos), navegación y nomenclatura propias de ND.
 */
import { DocumentoDetalle } from '@/app/(dashboard)/dashboard/facturas/[id]/page';

export default function NotaDebitoDetallePage() {
  return <DocumentoDetalle variant="nota-debito" />;
}
