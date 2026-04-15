import { getTeamIdForUser, getUserTeams } from '@/lib/db/queries';
import { EmpresasClient } from './_empresas-client';

export default async function EmpresasPage() {
  const [empresas, activeTeamId] = await Promise.all([
    getUserTeams(),
    getTeamIdForUser(),
  ]);

  return <EmpresasClient empresas={empresas} activeTeamId={activeTeamId} />;
}
