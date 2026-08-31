/**
 * GET/POST/DELETE /api/zero-tickets/agent-management
 *
 * Administra la lista de agentes de soporte (support_agents). A diferencia
 * del resto de /api/zero-tickets/agent/**, este endpoint controla QUIÉN
 * puede ser agente — eso se restringe a platformRole==='admin' únicamente
 * (no a requireZeroTicketsAgent(), que también deja pasar a agentes de
 * soporte normales). Mismo criterio que /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { supportAgents, users, ticketRatings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';

async function requirePlatformAdmin() {
  const user = await getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  if (user.platformRole !== 'admin') {
    return { ok: false as const, response: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  return { ok: true as const, user };
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const addedByUsers = db.select({ id: users.id, name: users.name, email: users.email }).from(users).as('added_by_users');

  const rows = await db
    .select({
      id: supportAgents.id,
      userId: supportAgents.userId,
      active: supportAgents.active,
      createdAt: supportAgents.createdAt,
      updatedAt: supportAgents.updatedAt,
      userName: users.name,
      userEmail: users.email,
      addedBy: supportAgents.addedBy,
      addedByName: addedByUsers.name,
      // Subquery correlacionada — usar nombre literal de tabla (users.id), no
      // interpolar ${users.id}: Drizzle lo trata como parámetro fijo (el de la
      // primera fila), no como referencia de columna por fila, y todas las filas
      // devolverían el mismo avgRating/ratingCount (mismo bug ya documentado en
      // /api/facturas y /api/zero-tickets/agent/tickets).
      avgRating: sql<string | null>`(
        SELECT AVG(${ticketRatings.rating}) FROM ${ticketRatings}
        WHERE ${ticketRatings.agentId} = users.id
      )`,
      ratingCount: sql<number>`(
        SELECT COUNT(*) FROM ${ticketRatings}
        WHERE ${ticketRatings.agentId} = users.id
      )`,
    })
    .from(supportAgents)
    .innerJoin(users, eq(users.id, supportAgents.userId))
    .leftJoin(addedByUsers, eq(addedByUsers.id, supportAgents.addedBy))
    .orderBy(supportAgents.createdAt);

  const agents = rows.map((r) => ({
    ...r,
    avgRating: r.avgRating != null ? Number(r.avgRating) : null,
    ratingCount: Number(r.ratingCount),
  }));

  return NextResponse.json({ agents });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const userId = Number(body?.userId);
  if (!userId || !Number.isInteger(userId)) {
    return NextResponse.json({ error: 'userId inválido' }, { status: 400 });
  }

  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!targetUser) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const [existing] = await db.select({ id: supportAgents.id }).from(supportAgents).where(eq(supportAgents.userId, userId)).limit(1);

  if (existing) {
    await db
      .update(supportAgents)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(supportAgents.userId, userId));
  } else {
    await db.insert(supportAgents).values({
      userId,
      active: true,
      addedBy: auth.user.id,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const userId = Number(body?.userId);
  if (!userId || !Number.isInteger(userId)) {
    return NextResponse.json({ error: 'userId inválido' }, { status: 400 });
  }

  const [existing] = await db.select({ id: supportAgents.id }).from(supportAgents).where(eq(supportAgents.userId, userId)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }

  await db
    .update(supportAgents)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(supportAgents.userId, userId));

  return NextResponse.json({ ok: true });
}
