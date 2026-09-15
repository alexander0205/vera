import { requirePermission } from '@/lib/auth/page-guard';
import ConfiguracionClient from './_page-client';

export default async function ConfiguracionNominaPage() {
  await requirePermission('nomina:configurar');
  return <ConfiguracionClient />;
}
