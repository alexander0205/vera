import { requirePermission } from '@/lib/auth/page-guard';
import ContratoEmpleadoClient from './_page-client';

export default async function ContratoEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('empleados:ver');
  const { id } = await params;
  return <ContratoEmpleadoClient id={id} />;
}
