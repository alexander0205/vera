/**
 * GET /api/productos/[id]/variants — Variantes activas de un producto.
 *
 * Alimenta el selector de variante en la línea de factura y en el POS. Solo
 * devuelve variantes activas; el precio se resuelve aquí (override de la
 * variante o, si es null, el precio del producto padre) para que el cliente no
 * tenga que conocer esa regla.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { products, productVariants, teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, asc } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
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

  const productId = Number((await params).id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Producto inválido' }, { status: 400 });
  }

  const [prod] = await db
    .select({ id: products.id, precio: products.precio })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.teamId, teamId)))
    .limit(1);
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  const rows = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.teamId, teamId), eq(productVariants.productId, productId), eq(productVariants.activo, true)))
    .orderBy(asc(productVariants.id));

  const variants = rows.map((v) => {
    const precioCents = v.precio ?? prod.precio; // override o precio del padre
    return {
      id:           v.id,
      nombre:       v.nombre,
      atributos:    v.atributos,
      referencia:   v.referencia,
      codigoBarras: v.codigoBarras,
      stockActual:  v.stockActual,
      stockMinimo:  v.stockMinimo,
      precioDOP:    precioCents / 100,
    };
  });

  return NextResponse.json({ variants });
}
