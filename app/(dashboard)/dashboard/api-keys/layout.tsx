import { requirePermission } from '@/lib/auth/page-guard';

export default async function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('configuracion:gestionar');
  return <>{children}</>;
}
