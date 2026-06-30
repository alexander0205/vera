import { NextRequest, NextResponse } from 'next/server';
import { getPagosListado } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';

/**
 * Listado avanzado de pagos recibidos del team (módulo de Pagos).
 * Solo roles con `pagos:ver` (por defecto owner + admin).
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&metodo=efectivo
 *   → { pagos, totales: { monto, count, porMetodo } }
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const data = await getPagosListado(teamId, {
    desde:  sp.get('desde')  || undefined,
    hasta:  sp.get('hasta')  || undefined,
    metodo: sp.get('metodo') || undefined,
  });
  return NextResponse.json(data);
}
