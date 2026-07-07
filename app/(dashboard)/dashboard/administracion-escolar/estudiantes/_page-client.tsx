'use client';

import { Users } from 'lucide-react';
import { EstadoVacioModulo } from '@/components/administracion-escolar/EstadoVacioModulo';

export default function EstudiantesClient() {
  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estudiantes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Listado de estudiantes, matrícula activa y deuda pendiente
        </p>
      </div>

      <EstadoVacioModulo
        icon={Users}
        title="Aún no hay estudiantes registrados"
        description="Cuando registres un estudiante, aparecerá aquí con su matrícula, tutor responsable y estado de cuenta."
      />
    </section>
  );
}
