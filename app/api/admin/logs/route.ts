/**
 * GET /api/admin/logs
 * Retorna los system_logs para el admin de la plataforma.
 * Query params: level (error|warn|info), limit (default 100), offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { systemLogs, users, teams } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { desc, eq, and, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // Solo superadmins (role = 'admin' en users)
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const url    = new URL(request.url);
  const level  = url.searchParams.get('level') ?? '';
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '100', 10), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0',   10), 0);

  const whereClause = level ? eq(systemLogs.level, level) : undefined;

  const logs = await db
    .select({
      id:        systemLogs.id,
      level:     systemLogs.level,
      source:    systemLogs.source,
      message:   systemLogs.message,
      details:   systemLogs.details,
      createdAt: systemLogs.createdAt,
      teamId:    systemLogs.teamId,
      teamName:  teams.name,
      userId:    systemLogs.userId,
      userEmail: users.email,
    })
    .from(systemLogs)
    .leftJoin(teams, eq(systemLogs.teamId, teams.id))
    .leftJoin(users, eq(systemLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(systemLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(systemLogs)
    .where(whereClause);

  return NextResponse.json({ logs, total: Number(total), limit, offset });
}
