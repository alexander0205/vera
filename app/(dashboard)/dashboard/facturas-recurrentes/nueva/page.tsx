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
      plazoPagoDefaultDias:  teams.plazoPagoDefaultDias,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 style={{ width: 32, height: 32, color: '#0d9488', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <NuevaFacturaRecurrenteForm initialPerfil={perfil} />
    </Suspense>
  );
}
