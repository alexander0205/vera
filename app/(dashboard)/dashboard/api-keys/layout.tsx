import { requirePermission } from '@/lib/auth/page-guard';

/**
 * Gate: requiere 'configuracion:gestionar' — mismo permiso que ya exigen
 * POST/DELETE /api/api-keys. Sin este guard cualquier miembro autenticado
 * podría llegar a la página, aunque las acciones de escritura del backend
 * las rechazarían igual.
 */
export default async function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('configuracion:gestionar');
  return <>{children}</>;
}
