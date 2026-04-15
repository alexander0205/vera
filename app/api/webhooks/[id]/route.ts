import { NextRequest, NextResponse } from 'next/server';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { outboundWebhooks } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.update(outboundWebhooks)
    .set({ activo: body.activo, updatedAt: new Date() })
    .where(and(eq(outboundWebhooks.id, Number(id)), eq(outboundWebhooks.teamId, teamId)));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  await db.delete(outboundWebhooks)
    .where(and(eq(outboundWebhooks.id, Number(id)), eq(outboundWebhooks.teamId, teamId)));
  return NextResponse.json({ success: true });
}
