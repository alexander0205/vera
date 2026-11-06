import { notFound, redirect } from 'next/navigation';
import { getTeamIdForUser } from '@/lib/db/queries';
import { hasPermission } from '@/lib/auth/page-guard';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { inventarioAulaVisible } from '@/lib/escolar/inventario-aula';
import { detalleAula } from '@/lib/escolar/inventario-aula-db';
import { hoyRD } from '@/lib/utils/format';
import { DetalleAulaClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Detalle de un aula (`/escolar/inventario-aula/12`) o de lo que no tiene aula
 * (`/escolar/inventario-aula/sin-aula`). Igual que la lista, no existe mientras el
 * colegio no tenga su planta configurada.
 */
export default async function DetalleAulaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const espacioId = id === 'sin-aula' ? null : Number(id);
  if (espacioId !== null && (!Number.isSafeInteger(espacioId) || espacioId <= 0)) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');
  if (!inventarioAulaVisible(await estadoPlantaDe(teamId))) notFound();

  let detalle;
  try {
    detalle = await detalleAula(teamId, espacioId);
  } catch (e) {
    console.error('[inventario-aula] no se pudo cargar el detalle', e instanceof Error ? e.message : e);
    notFound();
  }
  if (!detalle) notFound();

  const [puedeGestionar, puedeConfigurar] = await Promise.all([
    hasPermission('administracion-escolar:gestionar'),
    hasPermission('administracion-escolar:configurar'),
  ]);

  return <DetalleAulaClient detalle={detalle} hoy={hoyRD()} puedeGestionar={puedeGestionar} puedeConfigurar={puedeConfigurar} />;
}
