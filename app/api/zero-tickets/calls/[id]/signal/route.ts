import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gt } from 'drizzle-orm';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCallSignals } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  if (auth.call.status !== 'pendiente' && auth.call.status !== 'activa') {
    return NextResponse.json({ error: 'La llamada ya terminó' }, { status: 409 });
  }

  try {
    const { kind, sdp } = (await req.json()) as { kind: 'offer' | 'answer'; sdp: unknown };
    if (kind !== 'offer' && kind !== 'answer') {
      return NextResponse.json({ error: 'kind inválido' }, { status: 400 });
    }

    const [signal] = await db
      .insert(ticketCallSignals)
      .values({ callId, fromRole: auth.role, kind, payload: sdp })
      .returning();

    return NextResponse.json({ signal });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/signal POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  const desdeParam = req.nextUrl.searchParams.get('desde');
  const desde = desdeParam ? parseInt(desdeParam, 10) : 0;

  // Solo interesan las señales del OTRO lado — las propias ya las tengo.
  const otroRol = auth.role === 'user' ? 'agent' : 'user';

  try {
    const signals = await db
      .select()
      .from(ticketCallSignals)
      .where(and(eq(ticketCallSignals.callId, callId), eq(ticketCallSignals.fromRole, otroRol), gt(ticketCallSignals.id, desde)))
      .orderBy(asc(ticketCallSignals.id));

    return NextResponse.json({ signals });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/signal GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
