/**
 * Server component — carga el perfil de la empresa activa.
 * Igual que /facturas/nueva — al cambiar de empresa el form refleja los datos.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import NuevaFacturaRecurrenteForm from './NuevaFacturaRecurrenteForm';
import type { EmpresaPerfil } from '../../facturas/nueva/page';

async function getEmpresaPerfil(): Promise<EmpresaPerfil | null> {
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;
  const [team] = await db
    .select({
      razonSocial:     teams.razonSocial,
      nombreComercial: teams.nombreComercial,
      logo:            teams.logo,
      rnc:             teams.rnc,
      firma:           teams.firma,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team ?? null;
}

export default async function NuevaFacturaRecurrentePage() {
  const perfil = await getEmpresaPerfil();
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaRecurrenteForm initialPerfil={perfil} />
    </Suspense>
  );
}
