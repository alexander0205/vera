/**
 * GET /api/facturas/maestros — catálogo de maestros que aplican a facturas
 *   (target='factura') con sus valores. Para el form de nueva factura, que
 *   aún no tiene documento creado.
 * Gate: facturas:ver.
 */

import { NextResponse } from 'next/server';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { loadFacturaMaestros } from '@/lib/maestros/factura';

export async function GET() {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'facturas:ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const maestros = await loadFacturaMaestros(ctx.teamId);
  return NextResponse.json({ maestros });
}
