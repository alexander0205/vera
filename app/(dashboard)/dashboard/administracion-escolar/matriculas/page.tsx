import { ClipboardList } from 'lucide-react';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default function MatriculasPage() {
  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Matrículas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Matrícula de estudiantes por período escolar y curso
        </p>
      </div>

      <EstadoVacioModulo
        icon={ClipboardList}
        title="Aún no hay matrículas registradas"
        description="Cuando matricules un estudiante en un período y curso, aparecerá aquí."
      />
    </section>
  );
}
