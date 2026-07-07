import { Settings } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default async function ConfiguracionEscolarPage() {
  await requirePermission('administracion-escolar:configurar');

  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración escolar</h1>
        <p className="text-sm text-gray-500 mt-1">
          Períodos, cursos, materias y conceptos de pago
        </p>
      </div>

      <EstadoVacioModulo
        icon={Settings}
        title="Configuración escolar en construcción"
        description="Aquí administrarás los períodos escolares, cursos, materias y conceptos de pago del módulo."
      />
    </section>
  );
}
