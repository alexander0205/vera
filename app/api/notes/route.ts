/**
 * /api/notes — Notas genéricas por entidad.
 *
 * GET    ?entityType=factura&entityId=123  → lista notas (no eliminadas) del team.
 * POST   { entityType, entityId, text }    → crea nota.
 * DELETE ?id=N                              → soft delete (deletedAt = now).
 *
 * Scope: team (getTeamIdForUser). Notes son por team — no se filtran adicionalmente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { entityNotes, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { and, eq, desc, isNull } from 'drizzle-orm';

const VALID_ENTITY_TYPES = new Set(['factura', 'cliente', 'producto', 'cotizacion', 'pago']);

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const entityType = sp.get('entityType');
  const entityId   = sp.get('entityId');
  if (!entityType || !entityId) {
    return NextResponse.json({ error: 'entityType y entityId requeridos' }, { status: 400 });
  }

  const rows = await db
    .select({
      id:         entityNotes.id,
      text:       entityNotes.text,
      userId:     entityNotes.userId,
      userName:   users.name,
      userEmail:  users.email,
      createdAt:  entityNotes.createdAt,
      updatedAt:  entityNotes.updatedAt,
    })
    .from(entityNotes)
    .leftJoin(users, eq(users.id, entityNotes.userId))
    .where(and(
      eq(entityNotes.teamId, teamId),
      eq(entityNotes.entityType, entityType),
      eq(entityNotes.entityId, Number(entityId)),
      isNull(entityNotes.deletedAt),
    ))
    .orderBy(desc(entityNotes.createdAt));

  return NextResponse.json({ notes: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const { entityType, entityId, text } = body as { entityType?: string; entityId?: number; text?: string };

  if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: 'entityType inválido' }, { status: 400 });
  }
  if (!entityId || !Number.isInteger(entityId)) {
    return NextResponse.json({ error: 'entityId requerido' }, { status: 400 });
  }
  const cleanText = String(text ?? '').trim();
  if (!cleanText) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
  if (cleanText.length > 5000) return NextResponse.json({ error: 'Texto muy largo' }, { status: 400 });

  const [created] = await db.insert(entityNotes).values({
    teamId, entityType, entityId, userId: user.id, text: cleanText,
  }).returning();

  return NextResponse.json({ note: created }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  await db.update(entityNotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(entityNotes.id, id), eq(entityNotes.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
