import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [updated] = await db
    .update(tickets)
    .set({ assignedAgentId: user.id, status: 'abierto', updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: `${user.name ?? user.email} tomó este ticket.`,
  });

  return NextResponse.json({ ticket: updated });
}
