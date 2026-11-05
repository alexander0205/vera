'use client';

import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { EmpleadoWizard } from '../wizard';

/**
 * Alta de empleado en su PROPIA página (no modal). Pedido de Alex: en un modal,
 * cerrar por accidente borra todo lo tecleado del asistente. Aquí el estado vive
 * mientras el usuario esté en la página; al crear o cancelar vuelve al listado.
 */
export default function NuevoEmpleadoClient() {
  const router = useRouter();
  const volver = () => router.push('/nomina/empleados');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserPlus className="h-6 w-6 text-zero-600" /> Nuevo empleado
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completa los pasos. Tus datos se conservan mientras estés en esta página.
        </p>
      </div>

      <EmpleadoWizard
        editando={null}
        onCancel={volver}
        onSaved={() => router.push('/nomina/empleados')}
      />
    </div>
  );
}
