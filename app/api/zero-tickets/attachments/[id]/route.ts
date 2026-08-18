import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ticketAttachments, ticketMessages, tickets } from '@/lib/db/schema';
import { leerAdjuntoTicket } from '@/lib/storage/tickets';
import { isZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const attachmentId = parseInt(id, 10);
  if (Number.isNaN(attachmentId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select({ attachment: ticketAttachments, ticket: tickets })
    .from(ticketAttachments)
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .where(eq(ticketAttachments.id, attachmentId))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const esDueño = row.ticket.userId === user.id;
  const esAgente = esDueño ? false : await isZeroTicketsAgent(user);
  if (!esDueño && !esAgente) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { attachment } = row;
  const buffer = attachment.storage === 's3'
    ? await leerAdjuntoTicket(attachment.s3Key!)
    : Buffer.from(attachment.dataBase64!, 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.fileName.replace(/["\r\n]/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
