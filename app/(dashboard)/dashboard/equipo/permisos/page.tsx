import { requirePermission } from '@/lib/auth/page-guard';
import PermisosClient from './_permisos-client';

export default async function PermisosPage() {
  await requirePermission('equipo:gestionar');
  return <PermisosClient />;
}
