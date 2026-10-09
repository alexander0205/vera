import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCallRecordings } from '@/lib/db/schema';
import { leerAdjuntoTicket } from '@/lib/storage/tickets';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const recordingId = parseInt(id, 10);
  if (Number.isNaN(recordingId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select()
    .from(ticketCallRecordings)
    .where(eq(ticketCallRecordings.id, recordingId))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const buffer = await leerAdjuntoTicket(row.s3Key);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'video/webm',
      'Content-Disposition': `inline; filename="grabacion_${row.role}_${row.id}.webm"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
