import { UserCircle } from 'lucide-react';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default async function EstudiantePerfilPage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return (
    <section className="p-6 space-y-6">
      <EstadoVacioModulo
        icon={UserCircle}
        title="Perfil de estudiante en construcción"
        description="Aquí verás la información personal, matrícula activa, tutores, deudas, pagos e historial del estudiante."
      />
    </section>
  );
}
