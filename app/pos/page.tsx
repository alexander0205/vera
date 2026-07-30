import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTurnoAbierto } from '@/lib/caja/core';
import { listarTerminales } from '@/lib/pos/terminales';
import PosClient from './_pos-client';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  await requirePermission('pos:vender');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team?.posHabilitado) redirect('/dashboard');

  const user = await getUser();
  const [terminales, turno] = await Promise.all([
    listarTerminales(teamId),
    user ? getTurnoAbierto(teamId, user.id) : Promise.resolve(null),
  ]);

  const terminalActiva = turno?.terminalId
    ? (terminales.find((t) => t.id === turno.terminalId) ?? null)
    : null;

  return (
    <PosClient
      terminales={terminales.filter((t) => t.activo)}
      turnoInicial={turno}
      terminalInicial={terminalActiva}
      escolarHabilitado={!!team.posEscolarHabilitado}
      alertaMetodoPago={team.alertaMetodoPagoActiva !== false}
    />
  );
}
