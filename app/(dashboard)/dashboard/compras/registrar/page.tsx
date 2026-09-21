import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { contextoRegistro } from './_datos';
import RegistrarCompraClient from './_registrar-client';

/** Registrar el comprobante de un proveedor: inventario y lo que se compra para vender. */
export default async function RegistrarCompraPage({ searchParams }: { searchParams: Promise<{ ecf?: string; captura?: string }> }) {
  await requirePermission('productos:gestionar');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard');
  const { ecf, captura } = await searchParams;
  const capturaId = captura && /^\d+$/.test(captura) ? Number(captura) : null;
  return <RegistrarCompraClient contexto={await contextoRegistro(teamId, 'compra', ecf ?? null, capturaId)} />;
}
