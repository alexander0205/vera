import { requirePermission } from '@/lib/auth/page-guard';
import NuevoEmpleadoClient from './_page-client';

export default async function NuevoEmpleadoPage() {
  // Crear un empleado exige gestionar (no solo ver).
  await requirePermission('empleados:gestionar');
  return <NuevoEmpleadoClient />;
}
