import { redirect } from 'next/navigation';
import { getTeamIdForUser, getEcfDocuments } from '@/lib/db/queries';
import NotasDebitoClient, { type NotaDebito } from './_page-client';

export default async function NotasDebitoPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const allDocs = await getEcfDocuments(teamId, 500);
  const docs: NotaDebito[] = allDocs
    .filter(d => d.tipoEcf === '33')
    .map(d => ({
      id:                   d.id,
      encf:                 d.encf,
      codigo:               d.codigo ?? null,
      estado:               d.estado,
      estadoPago:           d.estadoPago,
      moraOrigenId:         d.moraOrigenId ?? null,
      razonSocialComprador: d.razonSocialComprador,
      montoTotal:           d.montoTotal,
      fechaEmision:         typeof d.fechaEmision === 'string' ? d.fechaEmision : d.fechaEmision.toISOString(),
    }));

  return <NotasDebitoClient docs={docs} />;
}
