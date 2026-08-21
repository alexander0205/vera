import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketCallRecordings } from '@/lib/db/schema';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const rows = await db
    .select({
      id: ticketCallRecordings.id,
      role: ticketCallRecordings.role,
      duracionSegundos: ticketCallRecordings.duracionSegundos,
      createdAt: ticketCallRecordings.createdAt,
    })
    .from(ticketCallRecordings)
    .innerJoin(ticketCalls, eq(ticketCalls.id, ticketCallRecordings.callId))
    .where(eq(ticketCalls.ticketId, ticketId))
    .orderBy(desc(ticketCallRecordings.createdAt));

  return NextResponse.json({ recordings: rows });
}
