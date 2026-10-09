import { requirePermission } from '@/lib/auth/page-guard';
import BancosClient from './_client';

export const dynamic = 'force-dynamic';

export default async function BancosPage() {
  await requirePermission('contabilidad:ver');
  return <BancosClient />;
}
