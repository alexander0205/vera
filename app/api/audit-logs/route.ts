/**
 * /api/audit-logs — Historia de eventos por recurso.
 *
 * GET ?docId=N&encf=ABC  → audit_logs + row_audit_log del team donde
 * resource ∈ {encf, `doc:N`}. Normaliza ambas fuentes en un formato unificado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { auditLogs, rowAuditLog, users } from '@/lib/db/schema';
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

  // ── Query 1: audit_logs (manual — ECF_SEND, PAGO_REGISTRADO, etc.) ──────────
  const manualLogs = await db
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
      resources.length === 1
        ? eq(auditLogs.resource, resources[0])
        : inArray(auditLogs.resource, resources),
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  // ── Query 2: row_audit_log (DB triggers — INSERT/UPDATE/DELETE) ─────────────
  let rowLogs: {
    id: number | string;
    action: string;
    resource: string | null;
    actor: string;
    userName: string | null;
    metadata: string | null;
    ipAddress: string | null;
    createdAt: Date | string;
    _source: 'row_audit';
    _operation: string;
    _changedCols: string[] | null;
  }[] = [];

  if (docId) {
    const rawRowLogs = await db
      .select({
        id:          rowAuditLog.id,
        operation:   rowAuditLog.operation,
        changedCols: rowAuditLog.changedCols,
        actor:       rowAuditLog.actor,
        userId:      rowAuditLog.userId,
        ipAddress:   rowAuditLog.ipAddress,
        changedAt:   rowAuditLog.changedAt,
      })
      .from(rowAuditLog)
      .where(and(
        eq(rowAuditLog.tableName, 'ecf_documents'),
        eq(rowAuditLog.rowPk, docId),
      ))
      .orderBy(desc(rowAuditLog.changedAt))
      .limit(100);

    // Resolver nombres de usuario para row_audit_log
    const userIds = [...new Set(rawRowLogs.map(r => r.userId).filter((id): id is number => id != null))];
    const userMap = new Map<number, string>();
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of userRows) {
        if (u.name) userMap.set(u.id, u.name);
      }
    }

    rowLogs = rawRowLogs.map(r => {
      const userName = r.userId ? (userMap.get(r.userId) ?? null) : null;
      const actorLabel = r.actor ?? userName ?? (r.userId ? `Usuario #${r.userId}` : 'Sistema');

      let action: string;
      switch (r.operation) {
        case 'I': action = 'DB_INSERT'; break;
        case 'U': action = 'DB_UPDATE'; break;
        case 'D': action = 'DB_DELETE'; break;
        default:  action = `DB_${r.operation}`;
      }

      return {
        id:          `row-${r.id}`,
        action,
        resource:    `doc:${docId}`,
        actor:       actorLabel,
        userName,
        metadata:    r.changedCols ? JSON.stringify({ changedCols: r.changedCols }) : null,
        ipAddress:   r.ipAddress,
        createdAt:   r.changedAt,
        _source:     'row_audit' as const,
        _operation:  r.operation ?? '',
        _changedCols: r.changedCols ?? null,
      };
    });
  }

  // ── Combinar y ordenar por fecha descendente ─────────────────────────────────
  const combined = [
    ...manualLogs.map(l => ({ ...l, _source: 'audit' as const, _operation: '', _changedCols: null as string[] | null })),
    ...rowLogs,
  ].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  return NextResponse.json({ logs: combined });
}
