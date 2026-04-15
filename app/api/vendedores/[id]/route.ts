import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { vendedores } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const venId = parseInt(id);
  if (isNaN(venId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const schema = z.object({
    nombre:         z.string().min(1).max(255).optional(),
    identificacion: z.string().max(100).nullable().optional(),
    observacion:    z.string().nullable().optional(),
    activo:         z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const [target] = await db.select().from(vendedores)
    .where(and(eq(vendedores.id, venId), eq(vendedores.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const upd: Partial<typeof vendedores.$inferInsert> = {};
  if (parsed.data.nombre         !== undefined) upd.nombre         = parsed.data.nombre.trim();
  if (parsed.data.identificacion !== undefined) upd.identificacion = parsed.data.identificacion?.trim() || null;
  if (parsed.data.observacion    !== undefined) upd.observacion    = parsed.data.observacion?.trim() || null;
  if (parsed.data.activo         !== undefined) upd.activo         = parsed.data.activo ? 'true' : 'false';

  const [updated] = await db.update(vendedores).set(upd).where(eq(vendedores.id, venId)).returning();
  return NextResponse.json({ vendedor: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const venId = parseInt(id);
  if (isNaN(venId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [target] = await db.select().from(vendedores)
    .where(and(eq(vendedores.id, venId), eq(vendedores.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // Soft delete (desactivar)
  await db.update(vendedores).set({ activo: 'false' }).where(eq(vendedores.id, venId));
  return NextResponse.json({ ok: true });
}
