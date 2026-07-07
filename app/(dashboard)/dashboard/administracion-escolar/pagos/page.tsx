import { Wallet } from 'lucide-react';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default function PagosEscolaresPage() {
  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pagos escolares</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pagos aplicados a cargos: inscripción, mensualidad y otros
        </p>
      </div>

      <EstadoVacioModulo
        icon={Wallet}
        title="Aún no hay pagos registrados"
        description="Los pagos aplicados a cargos escolares aparecerán aquí, con su estudiante, concepto, período y mes correspondiente."
      />
    </section>
  );
}
