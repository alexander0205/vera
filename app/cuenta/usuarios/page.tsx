import { requirePermission } from '@/lib/auth/page-guard';
import EquipoPage from '@/app/(dashboard)/dashboard/equipo/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Usuarios — Zero Administración' };

/** Usuarios del negocio (invitar, roles, acceso por módulo). */
export default async function CuentaUsuariosPage() {
  await requirePermission('equipo:ver');
  return <EquipoPage />;
}
