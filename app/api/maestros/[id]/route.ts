/**
 * GET    /api/maestros/[id] — un maestro con sus valores.
 * PUT    /api/maestros/[id] — actualiza nombre/descripcion/aplicaA/multiple.
 * DELETE /api/maestros/[id] — elimina (cascade a valores y asignaciones).
 * Gate: maestros:gestionar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { maestros, maestroValores, maestroTargets } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and, asc } from 'drizzle-orm';

const APLICA_A = ['bien', 'servicio', 'ambos', 'manual'] as const;
const ENTIDADES = ['producto', 'factura'] as const;

const updateSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  descripcion: z.string().max(2000).nullable().optional(),
  aplicaA: z.enum(APLICA_A).optional(),
  multiple: z.boolean().optional(),
  targets: z.array(z.enum(ENTIDADES)).min(1).optional(),
});

async function loadTargets(maestroId: number) {
  const rows = await db.select().from(maestroTargets).where(eq(maestroTargets.maestroId, maestroId));
  return rows.map(r => r.entidad);
}

async function loadOwned(teamId: number, id: number) {
  const [m] = await db.select().from(maestros)
    .where(and(eq(maestros.id, id), eq(maestros.teamId, teamId))).limit(1);
  return m ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const m = await loadOwned(ctx.teamId, id);
  if (!m) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const [valores, targets] = await Promise.all([
    db.select().from(maestroValores)
      .where(eq(maestroValores.maestroId, id))
      .orderBy(asc(maestroValores.orden), asc(maestroValores.id)),
    loadTargets(id),
  ]);

  return NextResponse.json({ maestro: { ...m, valores, targets } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const m = await loadOwned(ctx.teamId, id);
  if (!m) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(maestros).set({
      ...(d.nombre !== undefined ? { nombre: d.nombre.trim() } : {}),
      ...(d.descripcion !== undefined ? { descripcion: d.descripcion?.trim() || null } : {}),
      ...(d.aplicaA !== undefined ? { aplicaA: d.aplicaA } : {}),
      ...(d.multiple !== undefined ? { multiple: d.multiple } : {}),
      updatedAt: new Date(),
    }).where(and(eq(maestros.id, id), eq(maestros.teamId, ctx.teamId))).returning();

    if (d.targets !== undefined) {
      const uniq = [...new Set(d.targets)];
      await tx.delete(maestroTargets).where(eq(maestroTargets.maestroId, id));
      await tx.insert(maestroTargets).values(uniq.map(entidad => ({ maestroId: id, entidad })));
    }
    return updated;
  });

  const targets = await loadTargets(id);
  return NextResponse.json({ maestro: { ...row, targets } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const m = await loadOwned(ctx.teamId, id);
  if (!m) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.delete(maestros).where(and(eq(maestros.id, id), eq(maestros.teamId, ctx.teamId)));
  return NextResponse.json({ ok: true });
}
