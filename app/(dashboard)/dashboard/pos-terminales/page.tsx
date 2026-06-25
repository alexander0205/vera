import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams, almacenes, impresoras, listasPrecios } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { listarTerminales } from '@/lib/pos/terminales';
import TerminalesClient from './_page-client';

export const dynamic = 'force-dynamic';

export default async function PosTerminalesPage() {
  await requirePermission('pos:configurar');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team?.posHabilitado) redirect('/dashboard');

  const [terminales, alms, imps, listas] = await Promise.all([
    listarTerminales(teamId),
    db.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes).where(eq(almacenes.teamId, teamId)).orderBy(asc(almacenes.nombre)),
    db.select({ id: impresoras.id, nombre: impresoras.nombre }).from(impresoras).where(eq(impresoras.teamId, teamId)).orderBy(asc(impresoras.nombre)),
    db.select({ id: listasPrecios.id, nombre: listasPrecios.nombre }).from(listasPrecios).where(eq(listasPrecios.teamId, teamId)).orderBy(asc(listasPrecios.nombre)),
  ]);

  return (
    <TerminalesClient
      terminalesIniciales={terminales}
      almacenes={alms}
      impresoras={imps}
      listas={listas}
    />
  );
}
