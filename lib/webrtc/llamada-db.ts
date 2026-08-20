import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages, users } from '@/lib/db/schema';

const TIMEOUT_INVITACION_MS = 60_000;

export interface LlamadaVigente {
  id: number;
  ticketId: number;
  status: string;
  requestedBy: number;
  requestedByName: string | null;
  createdAt: Date;
  answeredAt: Date | null;
}

/**
 * La llamada pendiente o activa de un ticket, si hay una. Expira sola una
 * invitación que nadie respondió en 60s (expiración perezosa: se resuelve
 * acá, en la próxima lectura, no con un cron — mismo patrón que
 * `exigirOnboarding` en `lib/onboarding/muro.ts`).
 */
export async function obtenerLlamadaVigente(ticketId: number): Promise<LlamadaVigente | null> {
  const [row] = await db
    .select({ call: ticketCalls, requestedByName: users.name })
    .from(ticketCalls)
    .leftJoin(users, eq(users.id, ticketCalls.requestedBy))
    .where(and(eq(ticketCalls.ticketId, ticketId), inArray(ticketCalls.status, ['pendiente', 'activa'])))
    .orderBy(desc(ticketCalls.createdAt))
    .limit(1);

  if (!row) return null;

  const vencida = row.call.status === 'pendiente'
    && Date.now() - row.call.createdAt.getTime() > TIMEOUT_INVITACION_MS;

  if (vencida) {
    await Promise.all([
      db.update(ticketCalls)
        .set({ status: 'terminada', endedAt: new Date(), endedReason: 'timeout' })
        .where(eq(ticketCalls.id, row.call.id)),
      db.insert(ticketMessages).values({
        ticketId,
        senderType: 'system',
        content: 'Nadie respondió la llamada a tiempo.',
      }),
    ]);
    return null;
  }

  return {
    id: row.call.id,
    ticketId: row.call.ticketId,
    status: row.call.status,
    requestedBy: row.call.requestedBy,
    requestedByName: row.requestedByName,
    createdAt: row.call.createdAt,
    answeredAt: row.call.answeredAt,
  };
}
