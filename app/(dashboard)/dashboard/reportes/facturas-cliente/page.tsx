import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import FacturasClienteClient from './_page-client';

/**
 * Reporte «Facturas por cliente» — bajo demanda.
 *
 * No carga nada al abrir: el usuario elige un cliente y solo entonces se
 * consultan SUS facturas (acotadas por clientId desde el origen). Nunca se
 * trae la lista global de facturas —ni para el listado ni como fuente del
 * selector—, que es justo lo que cargaba de más la base. El selector se
 * alimenta de clientes, no de facturas.
 */
export default async function FacturasPorClientePage() {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  return <FacturasClienteClient />;
}
