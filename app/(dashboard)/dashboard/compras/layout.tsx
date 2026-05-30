import { requirePermission } from '@/lib/auth/page-guard';

/**
 * Server-side gate: solo owner y admin (compras:ver) pueden acceder
 * a cualquier página bajo /dashboard/compras. Redirige a /dashboard si no.
 */
export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('compras:ver');
  return <>{children}</>;
}
