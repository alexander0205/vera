/**
 * GET    /api/productos/[id]  — Detalle de un producto
 * PUT    /api/productos/[id]  — Actualiza un producto
 * DELETE /api/productos/[id]  — Elimina un producto
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

const updateSchema = z.object({
  nombre:      z.string().min(1).max(255),
  descripcion: z.string().max(1000).optional().nullable(),
  referencia:  z.string().max(100).optional().nullable(),
  precio:      z.number().min(0),
  tasaItbis:   z.enum(['0.18', '0.16', '0', 'exento']),
  tipo:        z.enum(['bien', 'servicio']),
  activo:      z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [prod] = await db.select().from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  return NextResponse.json({ producto: { ...prod, precioDOP: prod.precio / 100 } });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const [existing] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  const { nombre, descripcion, referencia, precio, tasaItbis, tipo, activo } = parsed.data;

  const [updated] = await db.update(products).set({
    nombre,
    descripcion:  descripcion || null,
    referencia:   referencia  || null,
    precio:       Math.round(precio * 100),
    tasaItbis,
    tipo,
    activo:     activo === false ? 'false' : 'true',
    updatedAt:  new Date(),
  }).where(eq(products.id, prodId)).returning();

  return NextResponse.json({ ok: true, producto: { ...updated, precioDOP: updated.precio / 100 } });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [existing] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  await db.delete(products).where(eq(products.id, prodId));
  return NextResponse.json({ ok: true });
}
