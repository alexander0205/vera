/**
 * GET /api/clientes/[id]/notas-credito-disponibles — Notas de crédito del cliente
 * usables como pago (voucher por código): con crédito, no anuladas, no usadas aún.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getNotasCreditoDisponibles } from '@/lib/facturas/notas-credito';

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

  const notas = await getNotasCreditoDisponibles(teamId, clientId);
  return NextResponse.json({ notas });
}
