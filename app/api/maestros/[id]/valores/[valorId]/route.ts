/**
 * PUT    /api/maestros/[id]/valores/[valorId] — renombra/reordena un valor.
 * DELETE /api/maestros/[id]/valores/[valorId] — elimina (cascade a asignaciones).
 * Gate: maestros:gestionar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { maestros, maestroValores } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and } from 'drizzle-orm';

const updateSchema = z.object({
  valor: z.string().min(1).max(150).optional(),
  orden: z.number().int().optional(),
});

/** Carga el valor garantizando que su maestro pertenece al equipo. */
async function loadOwnedValor(teamId: number, maestroId: number, valorId: number) {
  const [row] = await db.select({ id: maestroValores.id })
    .from(maestroValores)
    .innerJoin(maestros, eq(maestroValores.maestroId, maestros.id))
    .where(and(
      eq(maestroValores.id, valorId),
      eq(maestroValores.maestroId, maestroId),
      eq(maestros.teamId, teamId),
    )).limit(1);
  return row ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; valorId: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { id, valorId: vid } = await params;
  const maestroId = parseInt(id);
  const valorId = parseInt(vid);
  if (isNaN(maestroId) || isNaN(valorId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  if (!(await loadOwnedValor(ctx.teamId, maestroId, valorId))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const [row] = await db.update(maestroValores).set({
    ...(d.valor !== undefined ? { valor: d.valor.trim() } : {}),
    ...(d.orden !== undefined ? { orden: d.orden } : {}),
  }).where(eq(maestroValores.id, valorId)).returning();

  return NextResponse.json({ valor: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; valorId: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { id, valorId: vid } = await params;
  const maestroId = parseInt(id);
  const valorId = parseInt(vid);
  if (isNaN(maestroId) || isNaN(valorId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  if (!(await loadOwnedValor(ctx.teamId, maestroId, valorId))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  await db.delete(maestroValores).where(eq(maestroValores.id, valorId));
  return NextResponse.json({ ok: true });
}
