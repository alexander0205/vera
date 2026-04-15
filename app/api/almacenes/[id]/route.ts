import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { almacenes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const schema = z.object({
  nombre:      z.string().min(1).max(255).optional(),
  direccion:   z.string().max(500).nullable().optional(),
  observacion: z.string().nullable().optional(),
  esDefault:   z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const almId = parseInt(id);
  if (isNaN(almId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const [target] = await db.select().from(almacenes)
    .where(and(eq(almacenes.id, almId), eq(almacenes.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (parsed.data.esDefault) {
    await db.update(almacenes).set({ esDefault: 'false' }).where(eq(almacenes.teamId, teamId));
  }

  const upd: Partial<typeof almacenes.$inferInsert> = {};
  if (parsed.data.nombre    !== undefined) upd.nombre      = parsed.data.nombre.trim();
  if (parsed.data.direccion !== undefined) upd.direccion   = parsed.data.direccion?.trim() || null;
  if (parsed.data.observacion !== undefined) upd.observacion = parsed.data.observacion?.trim() || null;
  if (parsed.data.esDefault !== undefined) upd.esDefault   = parsed.data.esDefault ? 'true' : 'false';

  const [updated] = await db.update(almacenes).set(upd).where(eq(almacenes.id, almId)).returning();
  return NextResponse.json({ almacen: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const almId = parseInt(id);
  if (isNaN(almId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [target] = await db.select().from(almacenes)
    .where(and(eq(almacenes.id, almId), eq(almacenes.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.delete(almacenes).where(eq(almacenes.id, almId));
  return NextResponse.json({ ok: true });
}
