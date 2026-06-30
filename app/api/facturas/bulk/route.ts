import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teamMembers, users } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  // ── Gate: facturas:anular (único action soportado por ahora) ──────────────
  const [[u], [m]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
  ]);
  if (!await userCanForTeam(teamId, u?.platformRole, m?.role, 'facturas:anular')) {
    return NextResponse.json({ error: 'Sin permiso para anular facturas' }, { status: 403 });
  }

  const { action, ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'IDs requeridos' }, { status: 400 });
  }

  const numericIds = ids.map(Number).filter(Boolean);

  if (action === 'anular') {
    await db
      .update(ecfDocuments)
      .set({ estado: 'ANULADO', estadoPago: 'ANULADA', updatedAt: new Date() })
      .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, numericIds)));
    return NextResponse.json({ success: true, updated: numericIds.length });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
