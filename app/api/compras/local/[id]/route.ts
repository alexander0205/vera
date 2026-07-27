/**
 * GET /api/compras/local/[id] — Detalle de una compra local (registrada manual).
 * Devuelve la cabecera (proveedor, fecha, e-NCF, notas, total, quién registró)
 * + sus ítems con nombre/referencia del producto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { comprasLocales, comprasLocalesItems, products, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
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

  const { id } = await params;
  const compraId = parseInt(id);
  if (isNaN(compraId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [compra] = await db
    .select({
      id:              comprasLocales.id,
      fecha:           comprasLocales.fecha,
      proveedorNombre: comprasLocales.proveedorNombre,
      proveedorRnc:    comprasLocales.proveedorRnc,
      referenciaEncf:  comprasLocales.referenciaEncf,
      notas:           comprasLocales.notas,
      itbisCents:      comprasLocales.itbisCents,
      montoTotal:      comprasLocales.montoTotal,
      createdAt:       comprasLocales.createdAt,
      registradoPor:   users.name,
    })
    .from(comprasLocales)
    .leftJoin(users, eq(comprasLocales.createdBy, users.id))
    .where(and(eq(comprasLocales.id, compraId), eq(comprasLocales.teamId, teamId)))
    .limit(1);

  if (!compra) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });

  const items = await db
    .select({
      id:             comprasLocalesItems.id,
      productoId:     comprasLocalesItems.productoId,
      productoNombre: products.nombre,
      referencia:     products.referencia,
      cantidad:       comprasLocalesItems.cantidad,
      costoUnitario:  comprasLocalesItems.costoUnitario,
    })
    .from(comprasLocalesItems)
    .leftJoin(products, eq(comprasLocalesItems.productoId, products.id))
    .where(eq(comprasLocalesItems.compraId, compraId));

  return NextResponse.json({
    compra: {
      ...compra,
      proveedor:    compra.proveedorNombre ?? '—',
      registradoPor: compra.registradoPor ?? '—',
      items: items.map(it => ({
        ...it,
        productoNombre: it.productoNombre ?? '(producto eliminado)',
        subtotal:       it.costoUnitario * it.cantidad,
      })),
    },
  });
}
