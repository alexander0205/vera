import { redirect } from 'next/navigation';
import { getTeamIdForUser, getEcfDocuments } from '@/lib/db/queries';
import NotasCreditoClient, { type NotaCredito } from './_page-client';

export default async function NotasCreditoPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const allDocs = await getEcfDocuments(teamId, 500);
  const docs: NotaCredito[] = allDocs
    .filter(d => d.tipoEcf === '34')
    .map(d => ({
      id:                   d.id,
      encf:                 d.encf,
      estado:               d.estado,
      razonSocialComprador: d.razonSocialComprador,
      montoTotal:           d.montoTotal,
      fechaEmision:         typeof d.fechaEmision === 'string' ? d.fechaEmision : d.fechaEmision.toISOString(),
    }));

  return <NotasCreditoClient docs={docs} />;
}
