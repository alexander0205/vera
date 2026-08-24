import { requirePermission } from '@/lib/auth/page-guard';
import EmpleadosClient from './_page-client';

export default async function EmpleadosPage() {
  await requirePermission('empleados:ver');
  return <EmpleadosClient />;
}
