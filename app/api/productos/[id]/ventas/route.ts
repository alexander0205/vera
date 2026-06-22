/**
 * GET /api/productos/[id]/ventas — Historial de facturas donde se vendió este producto.
 *
 * Recorre inventory_movements (tipo=VENTA) del producto y los une con el e-CF
 * de referencia para traer cliente, fecha, vendedor y estado. El precio/cantidad
 * de la línea específica no vive en inventory_movements — se extrae parseando
 * `lineasJson` del documento y filtrando por este productoId.
 *
 * Una factura puede tener varios movimientos VENTA para el mismo producto si
 * el borrador se editó (cada edición restaura el descuento viejo con un
 * movimiento DEVOLUCION antes de aplicar el nuevo VENTA — ver
 * lib/inventario/devolucion.ts). Por eso se agrupa por referenciaId y se
 * neta VENTA-DEVOLUCION: si el neto es 0, esa factura ya no tiene el producto
 * vigente (se editó para quitarlo, o se anuló) y se omite de la lista.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { inventoryMovements, ecfDocuments, vendedores, products, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc, sql } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import type { ItemLinea } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/types';

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

  // Sin límite SQL: se agrupa y neta VENTA/DEVOLUCION en memoria antes de paginar.
  const rows = await db
    .select({
      movimientoId:   inventoryMovements.id,
      tipo:           inventoryMovements.tipo,
      cantidad:       inventoryMovements.cantidad,
      createdAt:      inventoryMovements.createdAt,
      ecfId:          ecfDocuments.id,
      encf:           ecfDocuments.encf,
      estado:         ecfDocuments.estado,
      fechaEmision:   ecfDocuments.fechaEmision,
      razonSocial:    ecfDocuments.razonSocialComprador,
      montoTotal:     ecfDocuments.montoTotal,
      lineasJson:     ecfDocuments.lineasJson,
      vendedorNombre: vendedores.nombre,
      // Fallback cuando no se asignó vendedor: usuario que creó la factura.
      creadorNombre:  users.name,
    })
    .from(inventoryMovements)
    .innerJoin(ecfDocuments, eq(inventoryMovements.referenciaId, ecfDocuments.id))
    .leftJoin(vendedores, eq(ecfDocuments.vendedorId, vendedores.id))
    .leftJoin(users, eq(ecfDocuments.createdBy, users.id))
    .where(and(
      eq(inventoryMovements.teamId, teamId),
      eq(inventoryMovements.productoId, prodId),
      sql`${inventoryMovements.tipo} IN ('VENTA', 'DEVOLUCION')`,
    ))
    .orderBy(desc(inventoryMovements.createdAt));

  type Row = typeof rows[number];
  const porFactura = new Map<number, { neto: number; ultima: Row }>();
  for (const r of rows) {
    const delta = r.tipo === 'VENTA' ? r.cantidad : -r.cantidad;
    const acc = porFactura.get(r.ecfId);
    if (!acc) {
      porFactura.set(r.ecfId, { neto: delta, ultima: r });
    } else {
      acc.neto += delta;
      if (r.createdAt > acc.ultima.createdAt) acc.ultima = r;
    }
  }

  const facturas = [...porFactura.values()]
    .filter(({ neto }) => neto > 0)
    .sort((a, b) => +new Date(b.ultima.fechaEmision) - +new Date(a.ultima.fechaEmision));

  const pagina = facturas.slice(offset, offset + limit);

  const ventas = pagina.map(({ neto, ultima: r }) => {
    let precioUnitario: number | null = null;
    if (r.lineasJson) {
      try {
        const lineas: ItemLinea[] = JSON.parse(r.lineasJson);
        const linea = lineas.find(l => l.productoId === prodId);
        if (linea) precioUnitario = linea.precioUnitarioItem;
      } catch {
        // lineasJson corrupto o ausente — se omite precio unitario para esta fila
      }
    }
    return {
      movimientoId:   r.movimientoId,
      ecfId:          r.ecfId,
      encf:           r.encf,
      estado:         r.estado,
      fecha:          r.fechaEmision,
      cliente:        r.razonSocial ?? '—',
      vendedor:       r.vendedorNombre ?? r.creadorNombre ?? '—',
      cantidad:       neto,
      precioUnitario,
      subtotal:       precioUnitario !== null ? precioUnitario * neto : null,
      montoTotalFactura: r.montoTotal,
    };
  });

  return NextResponse.json({ ventas });
}
