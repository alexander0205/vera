/**
 * GET /api/cuentas-por-cobrar/[docId]
 *   ?detalle=1  — incluye pagos, notas aplicadas y timeline (panel lateral)
 *
 * Una sola cuenta por cobrar (factura con saldo pendiente), con el mismo shape
 * que el listado. Sirve para reutilizar el modal de cobro fuera del listado
 * (p. ej. el perfil del estudiante), sin traer todas las cuentas del team.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getCuentasPorCobrar } from '@/lib/db/queries';
import { getDetalleCuenta } from '@/lib/cobranza/detalle';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
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

  const { docId } = await params;
  const id = parseInt(docId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { cuentas } = await getCuentasPorCobrar(teamId, { docId: id });
  const cuenta = cuentas[0] ?? null;

  if (new URL(req.url).searchParams.get('detalle') !== '1') {
    return NextResponse.json({ cuenta });
  }
  // El detalle se pide igual aunque la cuenta ya no esté en cartera (saldada
  // mientras el panel estaba abierto): el historial sigue siendo válido.
  const detalle = await getDetalleCuenta(teamId, id);
  return NextResponse.json({ cuenta, ...detalle });
}
