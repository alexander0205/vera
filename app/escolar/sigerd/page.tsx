import { requirePermission } from '@/lib/auth/page-guard';
import SigerdClient from './_page-client';

export default async function SigerdPage() {
  await requirePermission('administracion-escolar:ver');
  return <SigerdClient />;
}
