import { db } from './db/drizzle';
import { outboundWebhooks } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { createHmac } from 'crypto';

export async function dispatchWebhook(teamId: number, evento: string, payload: Record<string, unknown>) {
  const hooks = await db
    .select()
    .from(outboundWebhooks)
    .where(and(eq(outboundWebhooks.teamId, teamId), eq(outboundWebhooks.activo, true)));

  const active = hooks.filter(h => h.eventos.split(',').some(e => e.trim() === evento || e.trim() === '*'));

  await Promise.allSettled(
    active.map(async (hook) => {
      const body = JSON.stringify({ evento, timestamp: new Date().toISOString(), data: payload });
      const signature = createHmac('sha256', hook.secret).update(body).digest('hex');
      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EmiteDO-Signature': `sha256=${signature}`,
            'X-EmiteDO-Event': evento,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });
        await db.update(outboundWebhooks).set({
          ultimoDisparo: new Date(),
          ultimoEstatus: res.status,
          updatedAt: new Date(),
        }).where(eq(outboundWebhooks.id, hook.id));
      } catch {
        await db.update(outboundWebhooks).set({
          ultimoDisparo: new Date(),
          ultimoEstatus: 0,
          updatedAt: new Date(),
        }).where(eq(outboundWebhooks.id, hook.id));
      }
    })
  );
}
