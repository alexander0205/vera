import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from './drizzle';
import { getSession } from '@/lib/auth/session';

export interface AuditContext {
  userId?: number | null;
  teamId?: number | null;
  actor?: string | null;
  ip?: string | null;
}

/**
 * Ejecuta `fn` dentro de una transacción con el contexto de auditoría seteado
 * via `SET LOCAL` (visible para el trigger PL/pgSQL).
 *
 * Uso:
 *   await withAuditContext({ userId, teamId, ip }, async (tx) => {
 *     await tx.insert(clients).values(...);
 *   });
 *
 * Sin contexto, el trigger igual loguea — solo que con user_id NULL.
 */
export async function withAuditContext<T>(
  ctx: AuditContext,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (ctx.userId != null) {
      await tx.execute(sql`SELECT set_config('app.user_id', ${String(ctx.userId)}, true)`);
    }
    if (ctx.teamId != null) {
      await tx.execute(sql`SELECT set_config('app.team_id', ${String(ctx.teamId)}, true)`);
    }
    if (ctx.actor) {
      await tx.execute(sql`SELECT set_config('app.actor', ${ctx.actor}, true)`);
    }
    if (ctx.ip) {
      await tx.execute(sql`SELECT set_config('app.ip', ${ctx.ip}, true)`);
    }
    return fn(tx);
  });
}

/**
 * Conveniencia: lee sesión + headers y arma el contexto automáticamente.
 * Para usar dentro de Route Handlers (Next.js App Router).
 */
export async function withRequestAuditContext<T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
  overrides: Partial<AuditContext> = {},
): Promise<T> {
  const session = await getSession().catch(() => null);
  const hdrs = await headers().catch(() => null);

  const ip =
    hdrs?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs?.get('x-real-ip') ??
    null;

  return withAuditContext(
    {
      userId: overrides.userId ?? session?.user?.id ?? null,
      teamId: overrides.teamId ?? session?.activeTeamId ?? null,
      actor:  overrides.actor  ?? null,
      ip:     overrides.ip     ?? ip,
    },
    fn,
  );
}
