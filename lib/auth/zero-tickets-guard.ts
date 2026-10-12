/**
 * Guard de acceso a Zero Tickets — agente de plataforma (platformRole='admin')
 * O agente de soporte activo en support_agents. Desacoplado de platformRole
 * para poder dar acceso a soporte sin dar acceso al resto del panel admin.
 */
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { supportAgents } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

async function isActiveSupportAgent(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: supportAgents.id })
    .from(supportAgents)
    .where(and(eq(supportAgents.userId, userId), eq(supportAgents.active, true)))
    .limit(1);
  return Boolean(row);
}

export async function isZeroTicketsAgent(user: { id: number; platformRole: string | null }): Promise<boolean> {
  if (user.platformRole === 'admin') return true;
  return isActiveSupportAgent(user.id);
}

export interface AgentAuthOk {
  ok: true;
  user: SessionUser;
}
export interface AgentAuthErr {
  ok: false;
  response: NextResponse;
}

/** Para Route Handlers (app/api/zero-tickets/agent/**). */
export async function requireZeroTicketsAgent(): Promise<AgentAuthOk | AgentAuthErr> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  if (!(await isZeroTicketsAgent(user))) {
    return { ok: false, response: NextResponse.json({ error: 'Acceso restringido' }, { status: 403 }) };
  }
  return { ok: true, user };
}

/** Para app/zero-tickets/layout.tsx (Server Component). */
export async function requireZeroTicketsAgentPage(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/dashboard');
  if (!(await isZeroTicketsAgent(user))) redirect('/dashboard');
  return user;
}
