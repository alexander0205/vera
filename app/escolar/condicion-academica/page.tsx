import { requirePermission } from '@/lib/auth/page-guard';
import CondicionAcademicaClient from './_page-client';

export default async function CondicionAcademicaPage() {
  await requirePermission('administracion-escolar:ver');
  return <CondicionAcademicaClient />;
}
