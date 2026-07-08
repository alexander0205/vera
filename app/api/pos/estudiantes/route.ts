/**
 * GET /api/pos/estudiantes?q= — busca estudiantes (dependientes) con su saldo.
 * Requiere pos:vender y capa escolar activa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { buscarEstudiantes, escolarHabilitado } from '@/lib/pos/monedero';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  if (!(await escolarHabilitado(teamId))) {
    return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ estudiantes: [] });

  return NextResponse.json({ estudiantes: await buscarEstudiantes(teamId, q) });
}
