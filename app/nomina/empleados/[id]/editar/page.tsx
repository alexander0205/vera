import { requirePermission } from '@/lib/auth/page-guard';
import EditarEmpleadoClient from './_page-client';

export default async function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('empleados:gestionar');
  const { id } = await params;
  return <EditarEmpleadoClient id={id} />;
}
