import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { status } = (await req.json()) as { status: string };
  if (status !== 'abierto' && status !== 'cerrado') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const [updated] = await db
    .update(tickets)
    .set({ status, closedAt: status === 'cerrado' ? new Date() : null, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: status === 'cerrado' ? 'Ticket cerrado.' : 'Ticket reabierto.',
  });

  return NextResponse.json({ ticket: updated });
}
