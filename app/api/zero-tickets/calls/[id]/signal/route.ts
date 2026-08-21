import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gt } from 'drizzle-orm';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCallSignals } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let body: { kind: 'offer' | 'answer'; sdp: unknown; role?: 'user' | 'agent' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { kind, sdp, role } = body;
  if (role !== undefined && role !== 'user' && role !== 'agent') {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 });
  }

  const auth = await requireCallParticipant(callId, role);
  if (!auth.ok) return auth.response;

  if (auth.call.status !== 'pendiente' && auth.call.status !== 'activa') {
    return NextResponse.json({ error: 'La llamada ya terminó' }, { status: 409 });
  }

  try {
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

  const rolParam = req.nextUrl.searchParams.get('role');
  if (rolParam !== null && rolParam !== 'user' && rolParam !== 'agent') {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 });
  }

  const auth = await requireCallParticipant(callId, rolParam ?? undefined);
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
