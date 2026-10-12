import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getDgiiReadiness } from '@/lib/ecf/readiness';

/**
 * GET /api/ecf/readiness — ¿la empresa activa puede emitir e-CF fiscales?
 * Consumido por useDgiiReadiness/useTiposDisponibles para ocultar E31/E32
 * cuando no hay DGII conectada. Solo requiere sesión con team activo.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  // platformRole entra en el cálculo: el gate de Producción se omite en
  // desarrollo y para admin de plataforma (ver lib/ecf/readiness.ts).
  return NextResponse.json(await getDgiiReadiness(teamId, user.platformRole));
}
