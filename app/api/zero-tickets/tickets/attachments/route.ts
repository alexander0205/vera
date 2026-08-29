import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, ne } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, ticketAttachments } from '@/lib/db/schema';
import { s3Disponible, construirKeyTicket, subirAdjuntoTicket } from '@/lib/storage/tickets';

const MAX_BYTES = 15 * 1024 * 1024;
// Tope del respaldo en base. Va MUY por debajo de MAX_BYTES a propósito:
// guardar en `data_base64` infla el archivo un tercio y lo mete en una
// columna TEXT — con adjuntos grandes eso ya costó latencias de más de 100 s
// en este proyecto. Una captura de pantalla ronda los 150 KB, así que 2 MB
// cubre el caso real sin poner a Postgres a cargar videos.
const MAX_BYTES_EN_BASE = 2 * 1024 * 1024;
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

  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = parseInt(contentLength, 10);
    if (!Number.isNaN(declaredBytes) && declaredBytes > MAX_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo muy grande (máx 15MB)' }, { status: 400 });
    }
  }

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

  // Sube a S3 (o prepara el base64) ANTES de tocar la base de datos: si esto
  // falla, no queremos ningún registro huérfano de ticketMessages.
  //
  // El `try` no estaba y esa era la falla: el respaldo a base solo corría
  // cuando S3 NO estaba configurado. Con S3 configurado pero rechazando la
  // subida —credenciales sin permiso sobre el prefijo, por ejemplo— este
  // await tiraba y la ruta devolvía 500: cada captura que mandara un cliente
  // se caía sin recuperación. Ahora un fallo de S3 degrada a base en vez de
  // romper el envío.
  let usarS3 = s3Disponible();
  let key = usarS3 ? construirKeyTicket(teamId, ext) : null;
  if (usarS3 && key) {
    try {
      await subirAdjuntoTicket(key, buffer, file.type);
    } catch (err) {
      console.error('[zero-tickets/tickets/attachments POST] S3 falló, se guarda en base', err);
      usarS3 = false;
      key = null;
    }
  }

  // Guardar en base es el respaldo, no un camino equivalente: pasado el tope
  // conviene decirlo y que la persona reintente, no meter megabytes de
  // base64 en una columna TEXT.
  if (!usarS3 && buffer.length > MAX_BYTES_EN_BASE) {
    return NextResponse.json(
      { error: 'No se pudo guardar el archivo ahora mismo. Probá con uno más liviano o en un momento.' },
      { status: 503 },
    );
  }

  const msg = await db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, senderType: 'user', senderId: user.id, content: null })
      .returning();

    if (usarS3 && key) {
      await tx.insert(ticketAttachments).values({
        messageId: msg.id,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        kind: kindDeMime(file.type),
        storage: 's3',
        s3Key: key,
      });
    } else {
      await tx.insert(ticketAttachments).values({
        messageId: msg.id,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        kind: kindDeMime(file.type),
        storage: 'db',
        dataBase64: buffer.toString('base64'),
      });
    }

    await tx.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

    return msg;
  });

  return NextResponse.json({ ok: true, messageId: msg.id });
}
