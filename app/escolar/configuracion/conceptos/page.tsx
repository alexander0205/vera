import { ConceptosCatalogo } from '@/components/administracion-escolar/ConceptosCatalogo';
import { FacturacionAutomatica } from '@/components/administracion-escolar/FacturacionAutomatica';

/**
 * El interruptor va ARRIBA del catálogo y no en una pestaña propia porque
 * decide qué pasa con las fechas de emisión que se configuran justo debajo:
 * separarlos dejaría el calendario en una pantalla y su consecuencia en otra.
 */
export default function Page() {
  return (
    <div className="space-y-4">
      <FacturacionAutomatica />
      <ConceptosCatalogo />
    </div>
  );
}
