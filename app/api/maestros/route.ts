/**
 * GET  /api/maestros — lista maestros del equipo (con valores y targets).
 * POST /api/maestros — crea un maestro.
 * Gate: maestros:gestionar (solo admin/owner).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { maestros, maestroValores, maestroTargets } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, asc, inArray } from 'drizzle-orm';

const APLICA_A = ['bien', 'servicio', 'ambos', 'manual'] as const;
const ENTIDADES = ['producto', 'factura'] as const;

const createSchema = z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(2000).nullable().optional(),
  aplicaA: z.enum(APLICA_A).default('manual'),
  multiple: z.boolean().default(false),
  targets: z.array(z.enum(ENTIDADES)).min(1).default(['producto']),
});

export async function GET() {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const rows = await db.select().from(maestros)
    .where(eq(maestros.teamId, ctx.teamId))
    .orderBy(asc(maestros.nombre));

  const ids = rows.map(r => r.id);
  const [valores, targets] = await Promise.all([
    ids.length
      ? db.select().from(maestroValores)
          .where(inArray(maestroValores.maestroId, ids))
          .orderBy(asc(maestroValores.orden), asc(maestroValores.id))
      : Promise.resolve([]),
    ids.length
      ? db.select().from(maestroTargets).where(inArray(maestroTargets.maestroId, ids))
      : Promise.resolve([]),
  ]);

  const result = rows.map(m => ({
    ...m,
    valores: valores.filter(v => v.maestroId === m.id),
    targets: targets.filter(t => t.maestroId === m.id).map(t => t.entidad),
  }));

  return NextResponse.json({ maestros: result });
}

export async function POST(req: NextRequest) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'maestros:gestionar')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const { nombre, descripcion, aplicaA, multiple, targets } = parsed.data;
  const uniqTargets = [...new Set(targets)];

  const maestro = await db.transaction(async (tx) => {
    const [row] = await tx.insert(maestros).values({
      teamId: ctx.teamId,
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      aplicaA,
      multiple,
    }).returning();
    await tx.insert(maestroTargets).values(
      uniqTargets.map(entidad => ({ maestroId: row.id, entidad })),
    );
    return row;
  });

  return NextResponse.json({ maestro: { ...maestro, valores: [], targets: uniqTargets } });
}
