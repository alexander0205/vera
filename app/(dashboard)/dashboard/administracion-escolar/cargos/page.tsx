import { Receipt } from 'lucide-react';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default function CargosPage() {
  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cargos y deudas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inscripción, mensualidades y otros cargos por estudiante
        </p>
      </div>

      <EstadoVacioModulo
        icon={Receipt}
        title="Aún no hay cargos generados"
        description="Genera cargos de inscripción o mensualidad por período, curso y concepto. Aparecerán aquí con su estado de pago."
      />
    </section>
  );
}
