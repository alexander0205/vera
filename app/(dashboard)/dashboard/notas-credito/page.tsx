import { redirect } from 'next/navigation';
import { getTeamIdForUser, getEcfDocuments } from '@/lib/db/queries';
import { resolverPadresEmitidos } from '@/lib/facturas/padres-notas';
import NotasCreditoClient, { type NotaCredito } from './_page-client';

export default async function NotasCreditoPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const allDocs = await getEcfDocuments(teamId, 500);
  const notas = allDocs.filter(d => d.tipoEcf === '34');
  const padreEmitido = await resolverPadresEmitidos(teamId, notas);

  const docs: NotaCredito[] = notas.map(d => ({
    id:                   d.id,
    encf:                 d.encf,
    codigo:               d.codigo ?? null,
    estado:               d.estado,
    razonSocialComprador: d.razonSocialComprador,
    montoTotal:           d.montoTotal,
    fechaEmision:         typeof d.fechaEmision === 'string' ? d.fechaEmision : d.fechaEmision.toISOString(),
    ncfModificado:        d.ncfModificado ?? null,
    codigoModificacion:   d.codigoModificacion ?? null,
    razonModificacion:    d.razonModificacion ?? null,
    origenDocumentoId:    d.origenDocumentoId ?? null,
    // Padre con e-CF emitido + nota en borrador → puede (no debe) emitirse
    padreEmitido:         padreEmitido.get(d.id) ?? false,
  }));

  return <NotasCreditoClient docs={docs} />;
}
