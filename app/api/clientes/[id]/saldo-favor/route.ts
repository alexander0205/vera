/**
 * GET /api/clientes/[id]/saldo-favor — Saldo a favor (crédito) disponible del
 * cliente, en centavos. Generado por Notas de Crédito (modelo nuevo) menos lo ya
 * aplicado a facturas. Scope por team (no filtra otros teams).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getSaldoFavorCliente } from '@/lib/facturas/notas-credito';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const saldoCents = await getSaldoFavorCliente(teamId, clientId);
  return NextResponse.json({ saldoCents });
}
