import { redirect } from 'next/navigation';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTurnoAbierto } from '@/lib/caja/core';
import { listarTerminales } from '@/lib/pos/terminales';
import { ensurePosDefaults } from '@/lib/pos/provision';
import PosClient from './_pos-client';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  await requirePermission('pos:vender');
  // Gate de módulo: empresa con 'pos' activo ∩ permiso modulo:pos del rol.
  // Reemplaza el check legacy team.posHabilitado.
  await requireModule('pos');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect('/dashboard');

  // Garantiza la cadena almacén → terminal para empresas nuevas: crea
  // "Almacén principal" y "Caja principal" (sin-ncf) si no existen.
  await ensurePosDefaults(teamId);

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
    />
  );
}
