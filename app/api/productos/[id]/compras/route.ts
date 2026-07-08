/**
 * GET /api/productos/[id]/compras — Historial de compras de este producto.
 *
 * Espejo de /ventas pero para entradas: une compras_locales_items (filtradas
 * por productoId) con compras_locales para traer proveedor, fecha, e-NCF y el
 * usuario que registró la compra. A diferencia de ventas, el costo/cantidad ya
 * viven estructurados en la tabla de items (costoUnitario), así que no hay que
 * parsear JSON ni netear — las compras locales no tienen flujo de edición.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { comprasLocales, comprasLocalesItems, products, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
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
  if (!userCan(user.platformRole, m?.role, 'productos:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [prod] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  const params2 = new URL(req.url).searchParams;
  const limit  = Math.min(parseInt(params2.get('limit') ?? '50'), 200);
  const offset = parseInt(params2.get('offset') ?? '0');

  const rows = await db
    .select({
      itemId:          comprasLocalesItems.id,
      compraId:        comprasLocales.id,
      fecha:           comprasLocales.fecha,
      proveedorNombre: comprasLocales.proveedorNombre,
      proveedorRnc:    comprasLocales.proveedorRnc,
      referenciaEncf:  comprasLocales.referenciaEncf,
      cantidad:        comprasLocalesItems.cantidad,
      costoUnitario:   comprasLocalesItems.costoUnitario,
      creadorNombre:   users.name,
    })
    .from(comprasLocalesItems)
    .innerJoin(comprasLocales, eq(comprasLocalesItems.compraId, comprasLocales.id))
    .leftJoin(users, eq(comprasLocales.createdBy, users.id))
    .where(and(
      eq(comprasLocales.teamId, teamId),
      eq(comprasLocalesItems.productoId, prodId),
    ))
    .orderBy(desc(comprasLocales.fecha), desc(comprasLocales.id))
    .limit(limit)
    .offset(offset);

  const compras = rows.map(r => ({
    itemId:       r.itemId,
    compraId:     r.compraId,
    fecha:        r.fecha,
    proveedor:    r.proveedorNombre ?? '—',
    proveedorRnc: r.proveedorRnc ?? null,
    referenciaEncf: r.referenciaEncf ?? null,
    registradoPor:  r.creadorNombre ?? '—',
    cantidad:       r.cantidad,
    costoUnitario:  r.costoUnitario,                  // centavos
    subtotal:       r.costoUnitario * r.cantidad,     // centavos
  }));

  return NextResponse.json({ compras });
}
