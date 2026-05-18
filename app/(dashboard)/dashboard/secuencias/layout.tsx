import { requirePermission } from '@/lib/auth/page-guard';

export default async function SecuenciasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('configuracion:ver');
  return <>{children}</>;
}
