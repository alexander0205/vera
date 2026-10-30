import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { historialDeAvisos } from '@/lib/administracion-escolar/panel-avisos';

/**
 * Lo que ya se le mandó a las familias en un rango de días, lo más reciente
 * primero: `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (días de RD; sin ellos, todo).
 *
 * Va aparte del resumen porque el resumen es lo de hoy y el historial crece
 * para siempre. Trae el rango entero (con tope) para que la pantalla lo
 * filtre, ordene y exporte sin volver a preguntar.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  return NextResponse.json(await historialDeAvisos(auth.teamId, {
    desde: sp.get('desde'),
    hasta: sp.get('hasta'),
  }));
}
