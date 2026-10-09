/**
 * GET /api/cuentas-por-cobrar
 *   ?clientId=123        — filtrar por cliente
 *   &soloVencidas=true   — solo facturas vencidas
 *   &search=texto        — razón social o RNC del comprador
 *   &tipoDoc=factura|nota-debito
 *   &estado=vencidas|al-dia
 *   &orden=reciente|antiguo|monto|vencimiento
 *   &limit=25&offset=0   — paginación server-side
 *
 * Lista facturas con saldo pendiente. Filtra, ordena y pagina en servidor; los
 * totales cubren toda la cartera filtrada, no solo la página devuelta.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getUser, getTeamIdForUser, getCuentasPorCobrar,
  CUBETAS_ANTIGUEDAD, type OrdenCartera, type CubetaAntiguedad,
} from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getMetricasPromesas } from '@/lib/cobranza/seguimiento';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'facturas:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const clientIdStr  = sp.get('clientId');
  const clientId     = clientIdStr ? parseInt(clientIdStr) : undefined;
  const soloVencidas = sp.get('soloVencidas') === 'true';

  const limitRaw  = parseInt(sp.get('limit') ?? '');
  const offsetRaw = parseInt(sp.get('offset') ?? '');

  // Whitelist: cualquier valor fuera de estos se ignora (no llega al SQL).
  const tipoDocRaw = sp.get('tipoDoc');
  const estadoRaw  = sp.get('estado');
  const ordenRaw   = sp.get('orden');
  const cubetaRaw  = sp.get('cubeta');
  const ORDENES: OrdenCartera[] = ['reciente', 'antiguo', 'monto', 'vencimiento'];

  // Las métricas de promesas son del team completo, no de la cartera filtrada:
  // "cuánto me prometieron y no llegó" no cambia porque el usuario filtre por
  // cubeta. Por eso van aparte del CTE y no dependen de `opts`.
  const [data, promesas] = await Promise.all([
    getCuentasPorCobrar(teamId, {
      clientId: clientId && !isNaN(clientId) ? clientId : undefined,
      soloVencidas,
      search:  sp.get('search') ?? undefined,
      tipoDoc: tipoDocRaw === 'factura' || tipoDocRaw === 'nota-debito' ? tipoDocRaw : undefined,
      estado:  estadoRaw === 'vencidas' || estadoRaw === 'al-dia' ? estadoRaw : undefined,
      orden:   ORDENES.includes(ordenRaw as OrdenCartera) ? (ordenRaw as OrdenCartera) : undefined,
      cubeta:  CUBETAS_ANTIGUEDAD.includes(cubetaRaw as CubetaAntiguedad) ? (cubetaRaw as CubetaAntiguedad) : undefined,
      limit:   Number.isFinite(limitRaw)  ? limitRaw  : undefined,
      offset:  Number.isFinite(offsetRaw) ? offsetRaw : undefined,
    }),
    getMetricasPromesas(teamId),
  ]);

  return NextResponse.json({ ...data, promesas });
}
