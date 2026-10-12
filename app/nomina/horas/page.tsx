import { requirePermission } from '@/lib/auth/page-guard';
import HorasNominaClient from './_page-client';

export default async function HorasNominaPage() {
  await requirePermission('empleados:ver');
  return <HorasNominaClient />;
}
