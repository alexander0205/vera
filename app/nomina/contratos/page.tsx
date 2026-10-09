import { requirePermission } from '@/lib/auth/page-guard';
import ContratosClient from './_page-client';

export default async function ContratosNominaPage() {
  await requirePermission('empleados:ver');
  return <ContratosClient />;
}
