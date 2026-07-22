import { requirePermission } from '@/lib/auth/page-guard';
import ConfiguracionEscolarClient from './_page-client';

export default async function ConfiguracionEscolarPage() {
  await requirePermission('administracion-escolar:configurar');
  return <ConfiguracionEscolarClient />;
}
