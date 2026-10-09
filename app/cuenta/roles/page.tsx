import { requirePermission } from '@/lib/auth/page-guard';
import PermisosClient from '@/app/(dashboard)/dashboard/equipo/permisos/_permisos-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Roles y permisos — Zero Administración' };

/** Matriz de roles y permisos, incluido el acceso a módulos. */
export default async function CuentaRolesPage() {
  await requirePermission('equipo:gestionar');
  return <PermisosClient />;
}
