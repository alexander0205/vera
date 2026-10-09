import EmpresasPage from '@/app/(dashboard)/dashboard/empresas/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mis empresas — Zero Administración' };

/** Empresas del usuario (multi-negocio) y cambio de la activa. */
export default async function CuentaEmpresasPage() {
  return <EmpresasPage />;
}
