import { requirePermission } from '@/lib/auth/page-guard';
import AusenciasEmpleadoClient from './_page-client';

export default async function AusenciasEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('empleados:ver');
  const { id } = await params;
  return <AusenciasEmpleadoClient id={id} />;
}
