import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const { action, ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'IDs requeridos' }, { status: 400 });
  }

  const numericIds = ids.map(Number).filter(Boolean);

  if (action === 'anular') {
    await db
      .update(ecfDocuments)
      .set({ estado: 'ANULADO', updatedAt: new Date() })
      .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, numericIds)));
    return NextResponse.json({ success: true, updated: numericIds.length });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
