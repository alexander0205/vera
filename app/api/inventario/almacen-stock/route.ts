/**
 * GET /api/inventario/almacen-stock
 * Stock por almacén para los productos del equipo.
 *
 * ?productoId=N  — stock de un producto específico en todos sus almacenes
 * ?almacenId=N   — todos los productos con stock en ese almacén
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { productAlmacenStock, products, almacenes, teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!userCan(user.platformRole, m?.role, 'productos:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const params     = new URL(req.url).searchParams;
  const productoId = params.get('productoId') ? parseInt(params.get('productoId')!) : null;
  const almacenId  = params.get('almacenId')  ? parseInt(params.get('almacenId')!)  : null;

  const conditions = [eq(productAlmacenStock.teamId, teamId)];
  if (productoId) conditions.push(eq(productAlmacenStock.productId, productoId));
  if (almacenId)  conditions.push(eq(productAlmacenStock.almacenId, almacenId));

  const rows = await db
    .select({
      id:              productAlmacenStock.id,
      productId:       productAlmacenStock.productId,
      almacenId:       productAlmacenStock.almacenId,
      stockActual:     productAlmacenStock.stockActual,
      productoNombre:  products.nombre,
      almacenNombre:   almacenes.nombre,
    })
    .from(productAlmacenStock)
    .leftJoin(products,  eq(productAlmacenStock.productId,  products.id))
    .leftJoin(almacenes, eq(productAlmacenStock.almacenId,  almacenes.id))
    .where(and(...conditions))
    .orderBy(almacenes.nombre, products.nombre);

  return NextResponse.json({ stockPorAlmacen: rows });
}
