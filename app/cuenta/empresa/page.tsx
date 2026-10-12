import { requirePermission } from '@/lib/auth/page-guard';
import ConfiguracionPage from '@/app/(dashboard)/dashboard/configuracion/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi empresa — Zero Administración' };

/** Perfil fiscal y ajustes de la empresa activa. */
export default async function CuentaEmpresaPage() {
  await requirePermission('configuracion:ver');
  return <ConfiguracionPage />;
}
