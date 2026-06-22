/**
 * GET /api/productos/[id]/maestros — maestros del equipo aplicables a este
 *   producto (con flag `auto`) + valores disponibles + asignaciones actuales.
 * PUT /api/productos/[id]/maestros — reemplaza las asignaciones del producto.
 *
 * Gate: GET → productos:ver (cualquiera que edite productos ve los dropdowns).
 *       PUT → productos:gestionar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products, maestros, maestroValores, productoMaestroValores } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and, inArray, asc } from 'drizzle-orm';

/** ¿El maestro aplica automáticamente al tipo del producto? */
function aplicaAuto(aplicaA: string, tipo: string): boolean {
  if (aplicaA === 'ambos') return true;
  return aplicaA === tipo; // 'bien' | 'servicio'
}

async function loadProduct(teamId: number, id: number) {
  const [p] = await db.select({ id: products.id, tipo: products.tipo })
    .from(products).where(and(eq(products.id, id), eq(products.teamId, teamId))).limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'productos:ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const product = await loadProduct(ctx.teamId, id);
  if (!product) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const ms = await db.select().from(maestros)
    .where(eq(maestros.teamId, ctx.teamId)).orderBy(asc(maestros.nombre));

  const ids = ms.map(m => m.id);
  const valores = ids.length
    ? await db.select().from(maestroValores)
        .where(inArray(maestroValores.maestroId, ids))
        .orderBy(asc(maestroValores.orden), asc(maestroValores.id))
    : [];

  const asignaciones = await db.select({
    maestroId: productoMaestroValores.maestroId,
    valorId: productoMaestroValores.valorId,
  }).from(productoMaestroValores).where(eq(productoMaestroValores.productId, id));

  const result = ms.map(m => ({
    ...m,
    auto: aplicaAuto(m.aplicaA, product.tipo),
    valores: valores.filter(v => v.maestroId === m.id),
  }));

  return NextResponse.json({ maestros: result, asignaciones });
}

const putSchema = z.object({
  asignaciones: z.array(z.object({
    maestroId: z.number().int(),
    valorId: z.number().int(),
  })),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'productos:gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const product = await loadProduct(ctx.teamId, id);
  if (!product) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const { asignaciones } = parsed.data;

  // Validar: cada (maestroId, valorId) existe, el maestro es del equipo y el
  // valor pertenece a ese maestro. Además respetar single (multiple=false).
  const teamMaestros = await db.select().from(maestros).where(eq(maestros.teamId, ctx.teamId));
  const byId = new Map(teamMaestros.map(m => [m.id, m]));

  const valIds = asignaciones.map(a => a.valorId);
  const vals = valIds.length
    ? await db.select().from(maestroValores).where(inArray(maestroValores.id, valIds))
    : [];
  const valById = new Map(vals.map(v => [v.id, v]));

  const seenSingle = new Set<number>();
  const clean: { maestroId: number; valorId: number }[] = [];
  const dedup = new Set<string>();

  for (const a of asignaciones) {
    const m = byId.get(a.maestroId);
    const v = valById.get(a.valorId);
    if (!m || !v || v.maestroId !== a.maestroId) {
      return NextResponse.json({ error: 'Asignación inválida' }, { status: 400 });
    }
    if (!m.multiple) {
      if (seenSingle.has(m.id)) {
        return NextResponse.json({ error: `El maestro "${m.nombre}" solo admite un valor` }, { status: 400 });
      }
      seenSingle.add(m.id);
    }
    const key = `${a.maestroId}:${a.valorId}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    clean.push({ maestroId: a.maestroId, valorId: a.valorId });
  }

  // Reemplazo total de las asignaciones del producto.
  await db.transaction(async (tx) => {
    await tx.delete(productoMaestroValores).where(eq(productoMaestroValores.productId, id));
    if (clean.length) {
      await tx.insert(productoMaestroValores).values(
        clean.map(c => ({ productId: id, maestroId: c.maestroId, valorId: c.valorId })),
      );
    }
  });

  return NextResponse.json({ ok: true, count: clean.length });
}
