import { requirePermission } from '@/lib/auth/page-guard';
import PersonalClient from './_page-client';

export default async function PersonalPage() {
  await requirePermission('administracion-escolar:ver');
  return <PersonalClient />;
}
