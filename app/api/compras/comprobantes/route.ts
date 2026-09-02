/**
 * GET /api/compras/comprobantes — comprobantes de compra (e41) que el negocio
 * registra desde el formulario de compra. Distinto de las e-CF recibidas
 * (recepción DGII) y de las compras registradas (inventario, compras_locales).
 */
import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getComprobantesCompra } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { docs, totalCents, count } = await getComprobantesCompra(teamId);
  return NextResponse.json({ items: docs, totalCents, count });
}
