import { redirect } from 'next/navigation';
import { getTeamIdForUser, getEcfDocuments } from '@/lib/db/queries';
import { resolverPadresEmitidos } from '@/lib/facturas/padres-notas';
import NotasDebitoClient, { type NotaDebito } from './_page-client';

export default async function NotasDebitoPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const notas = await getEcfDocuments(teamId, 500, ['33']);
  const padreEmitido = await resolverPadresEmitidos(teamId, notas);

  const docs: NotaDebito[] = notas.map(d => ({
    id:                   d.id,
    encf:                 d.encf,
    codigo:               d.codigo ?? null,
    estado:               d.estado,
    estadoPago:           d.estadoPago,
    moraOrigenId:         d.moraOrigenId ?? null,
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

  return <NotasDebitoClient docs={docs} />;
}
