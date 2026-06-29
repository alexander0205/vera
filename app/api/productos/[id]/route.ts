/**
 * GET    /api/productos/[id]  — Detalle de un producto
 * PUT    /api/productos/[id]  — Actualiza un producto
 * DELETE /api/productos/[id]  — Elimina un producto
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, sql } from 'drizzle-orm';

const updateSchema = z.object({
  nombre:               z.string().min(1).max(255),
  descripcion:          z.string().max(1000).optional().nullable(),
  referencia:           z.string().max(100).optional().nullable(),
  codigoBarras:         z.string().max(64).optional().nullable(),
  precio:               z.number().min(0),
  tasaItbis:            z.enum(['0.18', '0.16', '0', 'exento']),
  tipo:                 z.enum(['bien', 'servicio']),
  activo:               z.boolean().optional(),
  unidadMedida:         z.string().max(50).optional(),
  costo:                z.number().min(0).optional(),
  stockActual:          z.number().int().min(0).optional(),
  stockMinimo:          z.number().int().min(0).optional(),
  controlaInventario:   z.boolean().optional(),
  permiteVentaSinStock: z.boolean().optional(),
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

  return NextResponse.json({ producto: { ...prod, precioDOP: prod.precio / 100, costoDOP: prod.costo / 100 } });
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

  const {
    nombre, descripcion, referencia, codigoBarras, precio, tasaItbis, tipo, activo,
    unidadMedida, costo, stockActual, stockMinimo, controlaInventario, permiteVentaSinStock,
  } = parsed.data;

  // Transacción: lock del producto, escribe campos, y si stockActual cambió
  // registra un movimiento de ajuste por el delta (no romper la auditoría de
  // inventory_movements — editar el número a mano debe dejar rastro).
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.execute<{ stock_actual: number; controla_inventario: boolean; tipo: string }>(sql`
      SELECT stock_actual, controla_inventario, tipo
      FROM products
      WHERE id = ${prodId} AND team_id = ${teamId}
      FOR UPDATE
    `);
    if (!existing) return null;

    const [row] = await tx.update(products).set({
      nombre,
      descripcion:          descripcion || null,
      referencia:           referencia  || null,
      codigoBarras:         codigoBarras || null,
      precio:               Math.round(precio * 100),
      tasaItbis,
      tipo,
      activo:               activo === false ? 'false' : 'true',
      ...(unidadMedida         !== undefined && { unidadMedida }),
      ...(costo                !== undefined && { costo: Math.round(costo * 100) }),
      ...(stockActual          !== undefined && { stockActual }),
      ...(stockMinimo          !== undefined && { stockMinimo }),
      ...(controlaInventario   !== undefined && { controlaInventario }),
      ...(permiteVentaSinStock !== undefined && { permiteVentaSinStock }),
      updatedAt: new Date(),
    }).where(eq(products.id, prodId)).returning();

    // Movimiento de auditoría solo si el stock cambió en un bien controlado.
    const controla = controlaInventario ?? existing.controla_inventario;
    if (stockActual !== undefined && existing.tipo === 'bien' && controla && stockActual !== existing.stock_actual) {
      const delta     = stockActual - existing.stock_actual;
      const esEntrada = delta > 0;
      await tx.insert(inventoryMovements).values({
        teamId,
        productoId:   prodId,
        tipo:         esEntrada ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
        cantidad:     Math.abs(delta),
        esEntrada,
        stockAntes:   existing.stock_actual,
        stockDespues: stockActual,
        motivo:       'Ajuste manual desde edición de producto',
        createdBy:    user.id,
      });
    }
    return row;
  });

  if (!updated) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, producto: { ...updated, precioDOP: updated.precio / 100, costoDOP: updated.costo / 100 } });
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
