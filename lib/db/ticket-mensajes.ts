import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ticketMessages, ticketAttachments } from '@/lib/db/schema';

/**
 * Mensajes de un ticket con la METADATA de sus adjuntos — nunca el contenido.
 *
 * `ticket_attachments.data_base64` guarda el archivo entero en base64 adentro
 * de la fila (es el fallback de storage cuando no hay S3 configurado, ver
 * `lib/storage/tickets.ts`). Seleccionar la tabla entera —
 * `.select({ attachment: ticketAttachments })` — arrastra ese blob en CADA
 * poll, y los dos lados pollean cada 1.5s. Medido sobre el ticket 1, con
 * 3.21 MB de base64 acumulado: 106_277ms por request contra Neon us-east-1,
 * contra 332ms trayendo solo metadata. Era la causa de que el chat tardara
 * minutos en cargar.
 *
 * El contenido del archivo se sirve aparte y bajo demanda, una vez por
 * adjunto, desde `/api/zero-tickets/attachments/[id]`.
 *
 * Las columnas van listadas de a una a propósito, en vez de pasar la tabla
 * entera: así, agregar mañana otra columna pesada al schema no vuelve a
 * meterla silenciosamente en el camino caliente del chat.
 */
export async function obtenerMensajesDeTicket(ticketId: number) {
  const filas = await db
    .select({
      message: ticketMessages,
      attachmentId: ticketAttachments.id,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      kind: ticketAttachments.kind,
    })
    .from(ticketMessages)
    .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));

  return filas.map((f) => ({
    ...f.message,
    // leftJoin sin adjunto deja todas las columnas en null — el cliente
    // espera `attachment: null`, no un objeto con campos nulos adentro.
    attachment:
      f.attachmentId == null
        ? null
        : {
            id: f.attachmentId,
            fileName: f.fileName as string,
            mimeType: f.mimeType as string,
            kind: f.kind as string,
          },
  }));
}
