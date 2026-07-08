import { PlanGate } from '@/components/plan-gate';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import ProductoDetalleClient from './_page-client';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;

  const teamId = await getTeamIdForUser();
  let posHabilitado = false;
  if (teamId) {
    const [t] = await db.select({ pos: teams.posHabilitado }).from(teams).where(eq(teams.id, teamId)).limit(1);
    posHabilitado = !!t?.pos;
  }

  return (
    <>
      <PlanGate feature="productos" />
      <ProductoDetalleClient productoId={parseInt(id)} posHabilitado={posHabilitado} />
    </>
  );
}
