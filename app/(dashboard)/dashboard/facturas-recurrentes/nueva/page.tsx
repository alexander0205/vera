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
      recargoMoraActivo:     teams.recargoMoraActivo,
      recargoMoraPorcentaje: teams.recargoMoraPorcentaje,
      recargoMoraDiasGracia: teams.recargoMoraDiasGracia,
      recargoMoraModo:       teams.recargoMoraModo,
      recargoMoraMontoCents: teams.recargoMoraMontoCents,
      recargoMoraPeriodicidadDias: teams.recargoMoraPeriodicidadDias,
      recargoMoraCompuesta:  teams.recargoMoraCompuesta,
      recargoMoraTopeBps:    teams.recargoMoraTopeBps,
      recargoMoraMaxPeriodos: teams.recargoMoraMaxPeriodos,
      plazoPagoDefaultDias:  teams.plazoPagoDefaultDias,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;
  // El schema tipa recargo_mora_modo como string; se estrecha a la unión.
  return { ...team, recargoMoraModo: team.recargoMoraModo === 'fijo' ? 'fijo' : 'porcentaje' };
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
