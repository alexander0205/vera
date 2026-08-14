import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, ne } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, ticketAttachments } from '@/lib/db/schema';
import { s3Disponible, construirKeyTicket, subirAdjuntoTicket } from '@/lib/storage/tickets';

const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_PERMITIDOS = /^(image\/|video\/|application\/pdf$)/;

function kindDeMime(mime: string): 'image' | 'video' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Archivo muy grande (máx 15MB)' }, { status: 400 });
  if (!TIPOS_PERMITIDOS.test(file.type)) return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id), ne(tickets.status, 'cerrado')))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);
  if (!ticket) return NextResponse.json({ error: 'No hay ticket activo' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() ?? 'bin';

  const [msg] = await db
    .insert(ticketMessages)
    .values({ ticketId: ticket.id, senderType: 'user', senderId: user.id, content: null })
    .returning();

  if (s3Disponible()) {
    const key = construirKeyTicket(teamId, ext);
    await subirAdjuntoTicket(key, buffer, file.type);
    await db.insert(ticketAttachments).values({
      messageId: msg.id,
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      kind: kindDeMime(file.type),
      storage: 's3',
      s3Key: key,
    });
  } else {
    await db.insert(ticketAttachments).values({
      messageId: msg.id,
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      kind: kindDeMime(file.type),
      storage: 'db',
      dataBase64: buffer.toString('base64'),
    });
  }

  await db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

  return NextResponse.json({ ok: true, messageId: msg.id });
}
