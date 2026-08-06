/**
 * Página de edición de una factura recurrente.
 * Server component — carga el perfil de empresa y el plan recurrente desde DB,
 * y reusa <NuevaFacturaRecurrenteForm> en modo edición vía `initialPlan`.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams, facturasRecurrentes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import NuevaFacturaRecurrenteForm, {
  type InitialPlan,
} from '../../nueva/NuevaFacturaRecurrenteForm';
import type { EmpresaPerfil } from '../../../facturas/nueva/page';

async function getEmpresaPerfil(teamId: number): Promise<EmpresaPerfil | null> {
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

async function getPlan(teamId: number, id: number): Promise<InitialPlan | null> {
  const [row] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, id), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);
  if (!row) return null;
  return {
    id:           row.id,
    nombre:       row.nombre,
    descripcion:  row.descripcion,
    tipoEcf:      row.tipoEcf,
    tipoPago:     row.tipoPago,
    diasParaPago: row.diasParaPago,
    frecuencia:   row.frecuencia,
    diaCobro:     row.diaCobro,
    fechaInicio:  row.fechaInicio,
    fechaFin:     row.fechaFin,
    estado:       row.estado,
    clientId:     row.clientId,
    items:        row.items,
    notas:        row.notas,
  };
}

type PageProps = { params: Promise<{ id: string }> };

export default async function EditarFacturaRecurrentePage({ params }: PageProps) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) notFound();

  const [perfil, plan] = await Promise.all([
    getEmpresaPerfil(teamId),
    getPlan(teamId, numId),
  ]);

  if (!plan) notFound();

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 style={{ width: 32, height: 32, color: '#3658e1', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <NuevaFacturaRecurrenteForm initialPerfil={perfil} initialPlan={plan} />
    </Suspense>
  );
}
