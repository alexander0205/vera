import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { listasPrecios, listasPrecios_items, products } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

// GET /api/listas-precios/[id] — detalle con items
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const listId = parseInt(id);
  if (isNaN(listId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [lista] = await db.select().from(listasPrecios)
    .where(and(eq(listasPrecios.id, listId), eq(listasPrecios.teamId, teamId))).limit(1);
  if (!lista) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Items con info del producto
  const items = await db
    .select({
      id:         listasPrecios_items.id,
      productoId: listasPrecios_items.productoId,
      precio:     listasPrecios_items.precio,
      nombre:     products.nombre,
      precioBase: products.precio,
    })
    .from(listasPrecios_items)
    .innerJoin(products, eq(listasPrecios_items.productoId, products.id))
    .where(eq(listasPrecios_items.listaPreciosId, listId));

  return NextResponse.json({ lista, items });
}

// PATCH /api/listas-precios/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const listId = parseInt(id);
  if (isNaN(listId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [target] = await db.select().from(listasPrecios)
    .where(and(eq(listasPrecios.id, listId), eq(listasPrecios.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const body = await req.json();
  const schema = z.object({
    nombre:      z.string().min(1).max(255).optional(),
    tipo:        z.enum(['valor', 'porcentaje']).optional(),
    porcentaje:  z.number().int().min(0).max(100000).optional(),
    esDescuento: z.boolean().optional(),
    descripcion: z.string().nullable().optional(),
    esDefault:   z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const d = parsed.data;
  if (d.esDefault) {
    await db.update(listasPrecios).set({ esDefault: 'false' }).where(eq(listasPrecios.teamId, teamId));
  }

  const upd: Partial<typeof listasPrecios.$inferInsert> = {};
  if (d.nombre      !== undefined) upd.nombre      = d.nombre.trim();
  if (d.tipo        !== undefined) upd.tipo        = d.tipo;
  if (d.porcentaje  !== undefined) upd.porcentaje  = d.porcentaje;
  if (d.esDescuento !== undefined) upd.esDescuento = d.esDescuento ? 'true' : 'false';
  if (d.descripcion !== undefined) upd.descripcion = d.descripcion?.trim() || null;
  if (d.esDefault   !== undefined) upd.esDefault   = d.esDefault ? 'true' : 'false';

  const [updated] = await db.update(listasPrecios).set(upd).where(eq(listasPrecios.id, listId)).returning();
  return NextResponse.json({ lista: updated });
}

// DELETE /api/listas-precios/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const listId = parseInt(id);
  if (isNaN(listId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [target] = await db.select().from(listasPrecios)
    .where(and(eq(listasPrecios.id, listId), eq(listasPrecios.teamId, teamId))).limit(1);
  if (!target) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Items se eliminan en cascada (ON DELETE CASCADE)
  await db.delete(listasPrecios).where(eq(listasPrecios.id, listId));
  return NextResponse.json({ ok: true });
}
