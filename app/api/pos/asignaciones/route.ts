/**
 * Asignación producto ↔ almacén para el catálogo del POS. Requiere pos:configurar.
 *
 * GET ?productId=N → almacenes con flag de asignación (vista por producto).
 * GET ?almacenId=N → productos con flag de asignación (vista por terminal/almacén).
 * PUT { productId, almacenIds } → fija los almacenes donde se vende el producto.
 * PUT { almacenId, productIds } → fija los productos que vende ese almacén.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import {
  almacenesDeProducto, productosDeAlmacen,
  setAlmacenesDeProducto, setProductosDeAlmacen,
} from '@/lib/pos/asignaciones';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const productId = Number(req.nextUrl.searchParams.get('productId'));
  const almacenId = Number(req.nextUrl.searchParams.get('almacenId'));

  if (Number.isInteger(productId) && productId > 0) {
    return NextResponse.json({ almacenes: await almacenesDeProducto(teamId, productId) });
  }
  if (Number.isInteger(almacenId) && almacenId > 0) {
    return NextResponse.json({ productos: await productosDeAlmacen(teamId, almacenId) });
  }
  return NextResponse.json({ error: 'productId o almacenId requerido' }, { status: 400 });
}

const putSchema = z.union([
  z.object({ productId: z.number().int().positive(), almacenIds: z.array(z.number().int().positive()) }),
  z.object({ almacenId: z.number().int().positive(), productIds: z.array(z.number().int().positive()) }),
]);

export async function PUT(req: NextRequest) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const resultado = 'productId' in data
    ? await setAlmacenesDeProducto(teamId, data.productId, data.almacenIds)
    : await setProductosDeAlmacen(teamId, data.almacenId, data.productIds);

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action: 'POS_ASIGNACION',
    resource: 'productId' in data ? `producto:${data.productId}` : `almacen:${data.almacenId}`,
    ip: getIp(req), meta: { ...resultado },
  });

  return NextResponse.json({ ok: true, ...resultado });
}
