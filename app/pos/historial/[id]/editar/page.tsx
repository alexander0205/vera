import { redirect } from 'next/navigation';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getTurnoAbierto } from '@/lib/caja/core';
import { listarTerminales } from '@/lib/pos/terminales';
import EditarReciboClient from './_editar-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editar recibo — Zero POS' };

/**
 * Editor de un recibo POS ya cobrado: añade líneas y cobra la diferencia.
 * Fase 1 (solo añadir). Gate: pos:anular (owner/admin). El catálogo y el modo
 * restaurante salen de la terminal del turno abierto del cajero.
 */
export default async function EditarReciboPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('pos:anular');
  await requireModule('pos', '/dashboard');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const id = Number((await params).id);
  if (!Number.isInteger(id)) redirect('/pos/historial');

  const user = await getUser();
  const turno = user ? await getTurnoAbierto(teamId, user.id) : null;
  const terminales = await listarTerminales(teamId);
  const terminal = turno?.terminalId ? (terminales.find((t) => t.id === turno.terminalId) ?? null) : null;

  return (
    <EditarReciboClient
      docId={id}
      terminal={terminal ? {
        id: terminal.id,
        nombre: terminal.nombre,
        almacenId: terminal.almacenId,
        listaPreciosId: terminal.listaPreciosId ?? null,
        mesas: !!terminal.mesas,
      } : null}
    />
  );
}
