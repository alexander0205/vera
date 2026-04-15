/**
 * GET  /api/listas-precios/[id]/items — precios por producto de esa lista
 * POST /api/listas-precios/[id]/items — guardar/actualizar precio de un producto
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { listasPrecios, listasPrecios_items, products } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

async function verifyOwnership(listId: number, teamId: number) {
  const [row] = await db.select({ id: listasPrecios.id }).from(listasPrecios)
    .where(and(eq(listasPrecios.id, listId), eq(listasPrecios.teamId, teamId))).limit(1);
  return !!row;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const listId = parseInt(id);
  if (isNaN(listId) || !await verifyOwnership(listId, teamId))
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const rows = await db
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

  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const { id } = await params;
    const listId = parseInt(id);
    if (isNaN(listId) || !await verifyOwnership(listId, teamId))
      return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

    const body = await req.json();
    const schema = z.object({
      productoId: z.number().int().positive(),
      precio:     z.number().int().min(0),   // centavos DOP * 100
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    // Upsert: actualizar si existe, crear si no
    const existing = await db.select().from(listasPrecios_items)
      .where(and(eq(listasPrecios_items.listaPreciosId, listId), eq(listasPrecios_items.productoId, parsed.data.productoId)))
      .limit(1);

    let item;
    if (existing.length > 0) {
      [item] = await db.update(listasPrecios_items)
        .set({ precio: parsed.data.precio })
        .where(eq(listasPrecios_items.id, existing[0].id))
        .returning();
    } else {
      [item] = await db.insert(listasPrecios_items).values({
        listaPreciosId: listId,
        productoId:     parsed.data.productoId,
        precio:         parsed.data.precio,
      }).returning();
    }

    return NextResponse.json({ item });
  } catch (err) {
    console.error('[POST /api/listas-precios/[id]/items]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
