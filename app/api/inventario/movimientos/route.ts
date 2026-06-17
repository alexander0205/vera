/**
 * GET /api/inventario/movimientos
 * Lista movimientos de inventario del equipo con filtros opcionales.
 * ?productoId=N  — filtrar por producto
 * ?tipo=VENTA    — filtrar por tipo de movimiento
 * ?limit=50      — paginación simple (default 50, max 200)
 * ?offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { inventoryMovements, products, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const params     = new URL(req.url).searchParams;
  const productoId = params.get('productoId') ? parseInt(params.get('productoId')!) : null;
  const tipo       = params.get('tipo');
  const limit      = Math.min(parseInt(params.get('limit') ?? '50'), 200);
  const offset     = parseInt(params.get('offset') ?? '0');

  const conditions = [eq(inventoryMovements.teamId, teamId)];
  if (productoId) conditions.push(eq(inventoryMovements.productoId, productoId));
  if (tipo)       conditions.push(eq(inventoryMovements.tipo, tipo));

  const rows = await db
    .select({
      id:             inventoryMovements.id,
      tipo:           inventoryMovements.tipo,
      cantidad:       inventoryMovements.cantidad,
      esEntrada:      inventoryMovements.esEntrada,
      stockAntes:     inventoryMovements.stockAntes,
      stockDespues:   inventoryMovements.stockDespues,
      referenciaEncf: inventoryMovements.referenciaEncf,
      motivo:         inventoryMovements.motivo,
      createdAt:      inventoryMovements.createdAt,
      productoId:     inventoryMovements.productoId,
      productoNombre: products.nombre,
      usuarioNombre:  users.name,
    })
    .from(inventoryMovements)
    .leftJoin(products, eq(inventoryMovements.productoId, products.id))
    .leftJoin(users,    eq(inventoryMovements.createdBy,  users.id))
    .where(and(...conditions))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ movimientos: rows });
}
