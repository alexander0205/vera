import { requirePermission } from '@/lib/auth/page-guard';
import CorridasClient from './_page-client';

export default async function CorridasPage() {
  await requirePermission('empleados:ver');
  return <CorridasClient />;
}
