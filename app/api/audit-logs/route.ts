/**
 * /api/audit-logs — Historia de eventos por recurso.
 *
 * GET ?docId=N&encf=ABC  → audit_logs del team donde resource ∈ {encf, `doc:N`}.
 * Útil para la pestaña Historia en el detalle de factura.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { auditLogs, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { and, eq, desc, or, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const docId = sp.get('docId');
  const encf  = sp.get('encf');
  if (!docId && !encf) {
    return NextResponse.json({ error: 'docId o encf requerido' }, { status: 400 });
  }

  const resources: string[] = [];
  if (encf)  resources.push(encf);
  if (docId) resources.push(`doc:${docId}`);

  const rows = await db
    .select({
      id:        auditLogs.id,
      action:    auditLogs.action,
      resource:  auditLogs.resource,
      actor:     auditLogs.actor,
      userName:  users.name,
      metadata:  auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(
      eq(auditLogs.teamId, teamId),
      resources.length === 1 ? eq(auditLogs.resource, resources[0]) : inArray(auditLogs.resource, resources),
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return NextResponse.json({ logs: rows });
}
