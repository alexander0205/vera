import { requirePermission } from '@/lib/auth/page-guard';

export default async function ImpresorasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('configuracion:ver');
  return <>{children}</>;
}
