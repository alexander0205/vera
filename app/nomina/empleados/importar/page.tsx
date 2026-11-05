import { requirePermission } from '@/lib/auth/page-guard';
import ImportarEmpleadosClient from './_page-client';

export default async function ImportarEmpleadosPage() {
  await requirePermission('empleados:gestionar');
  return <ImportarEmpleadosClient />;
}
