/**
 * POST /api/maestros/[id]/valores — agrega un valor (opción) al maestro.
 * Gate: maestros:gestionar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { maestros, maestroValores } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and } from 'drizzle-orm';

const createSchema = z.object({
  valor: z.string().min(1).max(150),
  orden: z.number().int().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const maestroId = parseInt((await params).id);
  if (isNaN(maestroId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  // Verificar que el maestro pertenece al equipo
  const [m] = await db.select({ id: maestros.id }).from(maestros)
    .where(and(eq(maestros.id, maestroId), eq(maestros.teamId, ctx.teamId))).limit(1);
  if (!m) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db.insert(maestroValores).values({
    maestroId,
    valor: parsed.data.valor.trim(),
    orden: parsed.data.orden ?? 0,
  }).returning();

  return NextResponse.json({ valor: row });
}
