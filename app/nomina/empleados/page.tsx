import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { teamHasModule } from '@/lib/auth/modules';
import EmpleadosClient from './_page-client';

export default async function EmpleadosPage() {
  await requirePermission('empleados:ver');
  // El botón "Importar del colegio" solo aparece si el team tiene escolar. Sin
  // el módulo, la nómina fluye igual — el enlace se genera solo si existe.
  const teamId = await getTeamIdForUser();
  const tieneEscolar = teamId ? await teamHasModule(teamId, 'escolar') : false;
  return <EmpleadosClient tieneEscolar={tieneEscolar} />;
}
