import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getTurnoAbierto } from '@/lib/caja/core';
import { getTerminal } from '@/lib/pos/terminales';
import PosHistorialClient from './_historial-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial — Zero POS' };

/** Historial de recibos del turno de caja: ver, filtrar, editar y anular. */
export default async function PosHistorialPage() {
  await requirePermission('pos:vender');
  await requireModule('pos', '/dashboard');

  // Modo restaurante de la terminal del turno abierto: gatea "comer aquí" y las
  // opciones de mesa (solo aparecen si la terminal opera con mesas/comandas).
  const teamId = await getTeamIdForUser();
  const user = await getUser();
  let modoMesas = false;
  if (teamId && user) {
    const turno = await getTurnoAbierto(teamId, user.id);
    if (turno?.terminalId) {
      const term = await getTerminal(teamId, turno.terminalId);
      modoMesas = !!term?.mesas;
    }
  }

  return <PosHistorialClient modoMesas={modoMesas} />;
}
