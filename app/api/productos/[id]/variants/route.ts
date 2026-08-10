/**
 * GET /api/productos/[id]/variants[?almacenId=N] — Variantes activas de un producto.
 *
 * Alimenta el selector de variante en la factura y el POS. El precio se resuelve
 * aquí (override de la variante o, si es null, el del producto padre). El stock:
 * si se pasa `almacenId`, devuelve el stock de la variante EN ESE ALMACÉN
 * (Opción B, product_variant_almacen_stock); si no, el stock global de la
 * variante (suma por almacenes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { products, productVariants, productVariantAlmacenStock, teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, asc } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  // productos:ver (dashboard/factura) o pos:vender (cajero del POS, que puede no
  // tener productos:ver pero sí necesita el selector de variante para vender).
  if (!userCan(user.platformRole, m?.role, 'productos:ver')
      && !userCan(user.platformRole, m?.role, 'pos:vender')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const productId = Number((await params).id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Producto inválido' }, { status: 400 });
  }

  const almacenParam = req.nextUrl.searchParams.get('almacenId');
  const almacenId = almacenParam ? Number(almacenParam) : null;

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

  // Stock por almacén (si se pidió) — una consulta para todas las variantes.
  let stockPorVariante: Map<number, number> | null = null;
  if (almacenId && Number.isInteger(almacenId)) {
    const pvas = await db
      .select({ variantId: productVariantAlmacenStock.variantId, stock: productVariantAlmacenStock.stockActual })
      .from(productVariantAlmacenStock)
      .where(and(eq(productVariantAlmacenStock.teamId, teamId), eq(productVariantAlmacenStock.almacenId, almacenId)));
    stockPorVariante = new Map(pvas.map((r) => [r.variantId, r.stock]));
  }

  const variants = rows.map((v) => {
    const precioCents = v.precio ?? prod.precio; // override o precio del padre
    // Con almacén: stock de esa bodega (0 si no hay fila). Sin almacén: global.
    const stockActual = stockPorVariante ? (stockPorVariante.get(v.id) ?? 0) : v.stockActual;
    return {
      id:           v.id,
      nombre:       v.nombre,
      atributos:    v.atributos,
      referencia:   v.referencia,
      codigoBarras: v.codigoBarras,
      stockActual,
      stockMinimo:  v.stockMinimo,
      precioDOP:    precioCents / 100,
    };
  });

  return NextResponse.json({ variants });
}
