/**
 * GET /api/reportes/maestros?maestroId=&desde=&hasta=
 * Agrega ventas por valor de un maestro de factura: # facturas + total (centavos).
 * Excluye ANULADO. Gate: reportes:ver.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, facturaMaestroValores, maestroValores, maestros, maestroTargets } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and, sql, gte, lte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'reportes:ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const maestroId = parseInt(sp.get('maestroId') ?? '', 10);
  if (!Number.isFinite(maestroId)) {
    return NextResponse.json({ error: 'maestroId requerido' }, { status: 400 });
  }
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';

  // Verificar que el maestro es del equipo y aplica a facturas.
  const [m] = await db.select({ id: maestros.id, nombre: maestros.nombre })
    .from(maestros)
    .innerJoin(maestroTargets, and(
      eq(maestroTargets.maestroId, maestros.id),
      eq(maestroTargets.entidad, 'factura'),
    ))
    .where(and(eq(maestros.id, maestroId), eq(maestros.teamId, ctx.teamId)))
    .limit(1);
  if (!m) return NextResponse.json({ error: 'Maestro no encontrado' }, { status: 404 });

  const conds = [
    eq(facturaMaestroValores.maestroId, maestroId),
    eq(ecfDocuments.teamId, ctx.teamId),
    sql`${ecfDocuments.estado} <> 'ANULADO'`,
  ];
  if (desde) conds.push(gte(ecfDocuments.createdAt, new Date(desde)));
  if (hasta) conds.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));

  const rows = await db.select({
    valorId: maestroValores.id,
    valor:   maestroValores.valor,
    count:   sql<number>`count(distinct ${ecfDocuments.id})`,
    total:   sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
  })
    .from(facturaMaestroValores)
    .innerJoin(ecfDocuments, eq(ecfDocuments.id, facturaMaestroValores.ecfDocumentId))
    .innerJoin(maestroValores, eq(maestroValores.id, facturaMaestroValores.valorId))
    .where(and(...conds))
    .groupBy(maestroValores.id, maestroValores.valor)
    .orderBy(sql`sum(${ecfDocuments.montoTotal}) desc`);

  const filas = rows.map(r => ({ ...r, count: Number(r.count), total: Number(r.total) }));
  const totalGeneral = filas.reduce((a, f) => a + f.total, 0);
  const totalFacturas = filas.reduce((a, f) => a + f.count, 0);

  return NextResponse.json({
    maestro: { id: m.id, nombre: m.nombre },
    filas, totalGeneral, totalFacturas,
  });
}
