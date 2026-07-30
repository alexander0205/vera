/**
 * Carga del perfil de la empresa activa (server-only).
 * Compartido por todas las pantallas de creación de comprobantes:
 * factura, nota de crédito, nota de débito, compras, gastos.
 */
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface EmpresaPerfil {
  razonSocial:     string | null;
  nombreComercial: string | null;
  logo:            string | null;
  rnc:             string | null;
  firma:           string | null;
  // Config de recargo por mora (para mostrar los términos al elegir crédito)
  recargoMoraActivo?:     boolean;
  recargoMoraPorcentaje?: number;  // basis points (200 = 2.00%)
  recargoMoraDiasGracia?: number;
  // Plazo de pago por defecto. null = de contado; N = crédito a N días.
  plazoPagoDefaultDias?:  number | null;
  // Alerta double-check del método de pago (POS + factura). Default true.
  alertaMetodoPagoActiva?: boolean;
}

export async function getEmpresaPerfil(): Promise<EmpresaPerfil | null> {
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
      alertaMetodoPagoActiva: teams.alertaMetodoPagoActiva,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team ?? null;
}
