import { requirePermission } from '@/lib/auth/page-guard';

/**
 * Gate: requiere 'configuracion:ver' (owner/admin + platform admin).
 * Roles 'user' / legacy se redirigen a /dashboard.
 *
 * Razón: configuración expone edición de RNC/razón social/dirección/firma — cambios
 * que afectan e-CF emitidos. Restringido a quienes administran el negocio.
 */
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('configuracion:ver');
  return <>{children}</>;
}
