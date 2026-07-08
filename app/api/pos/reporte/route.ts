/**
 * GET /api/pos/reporte?turnoId=N — corte X/Z de un turno.
 * Sin turnoId usa el turno abierto del cajero. Requiere pos:vender.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { getTurnoAbierto } from '@/lib/caja/core';
import { getReporteTurno } from '@/lib/pos/reporte';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  let turnoId = Number(req.nextUrl.searchParams.get('turnoId'));
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    const abierto = await getTurnoAbierto(teamId, user.id);
    if (!abierto) return NextResponse.json({ error: 'No hay turno' }, { status: 404 });
    turnoId = abierto.id;
  }

  const reporte = await getReporteTurno(teamId, turnoId);
  if (!reporte) return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
  return NextResponse.json(reporte);
}
