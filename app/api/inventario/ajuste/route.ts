/**
 * POST /api/inventario/ajuste
 * Registra un movimiento manual de stock: entrada, salida, corrección o stock inicial.
 * Actualiza stock_actual del producto atómicamente con SELECT FOR UPDATE.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, sql } from 'drizzle-orm';

const ajusteSchema = z.object({
  productoId:  z.number().int().positive(),
  tipo:        z.enum(['ENTRADA', 'AJUSTE_SALIDA', 'AJUSTE_ENTRADA', 'STOCK_INICIAL']),
  cantidad:    z.number().int().positive('La cantidad debe ser mayor a 0'),
  motivo:      z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const body = await req.json();
  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const { productoId, tipo, cantidad, motivo } = parsed.data;

  const esEntrada = tipo === 'ENTRADA' || tipo === 'AJUSTE_ENTRADA' || tipo === 'STOCK_INICIAL';

  const result = await db.transaction(async (tx) => {
    // Lock row para evitar race conditions en stock concurrente
    const [prod] = await tx.execute<{ id: number; stock_actual: number; controla_inventario: boolean; tipo: string; permite_venta_sin_stock: boolean }>(sql`
      SELECT id, stock_actual, controla_inventario, tipo, permite_venta_sin_stock
      FROM products
      WHERE id = ${productoId} AND team_id = ${teamId}
      FOR UPDATE
    `);

    if (!prod) return { error: 'Producto no encontrado', status: 404 };
    if (prod.tipo !== 'bien') return { error: 'Solo los productos tipo bien pueden tener ajustes de inventario', status: 422 };

    const stockAntes   = prod.stock_actual;
    const stockDespues = esEntrada ? stockAntes + cantidad : Math.max(0, stockAntes - cantidad);

    await tx.update(products)
      .set({ stockActual: stockDespues, updatedAt: new Date() })
      .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));

    const [mov] = await tx.insert(inventoryMovements).values({
      teamId,
      productoId,
      tipo,
      cantidad,
      esEntrada,
      stockAntes,
      stockDespues,
      motivo:    motivo || null,
      createdBy: user.id,
    }).returning();

    return { ok: true, movimiento: mov, stockActual: stockDespues };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status as number });
  }

  return NextResponse.json(result, { status: 201 });
}
