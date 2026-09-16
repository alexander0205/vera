import { redirect } from 'next/navigation';
import { requirePermissionAny } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { contextoRegistro } from '../../compras/registrar/_datos';
import RegistrarCompraClient from '../../compras/registrar/_registrar-client';

/** Registrar un gasto con el comprobante del proveedor (B01, E31…): va al 606 y adelanta ITBIS. */
export default async function RegistrarGastoPage() {
  await requirePermissionAny(['facturas:crear', 'productos:gestionar']);
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard');
  return <RegistrarCompraClient contexto={await contextoRegistro(teamId, 'gasto', null)} />;
}
