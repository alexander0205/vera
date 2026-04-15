/**
 * Server component — carga el perfil de la empresa activa en el servidor.
 * Esto garantiza que al cambiar de empresa (router.refresh), los datos
 * del emisor en el formulario de nueva factura se actualicen correctamente.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import NuevaFacturaFormClient from './_nueva-factura-client';

export interface EmpresaPerfil {
  razonSocial:     string | null;
  nombreComercial: string | null;
  logo:            string | null;
  rnc:             string | null;
  firma:           string | null;
}

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

export default async function NuevaFacturaPage() {
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} />
    </Suspense>
  );
}
