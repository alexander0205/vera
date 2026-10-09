import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { hoyRD } from '@/lib/administracion-escolar/dashboard';
import { construirLibroReporte, mesValido, reporteMensual } from '@/lib/administracion-escolar/reporte-mensual';

export const dynamic = 'force-dynamic';

/**
 * GET /api/administracion-escolar/dashboard/exportar?mes=YYYY-MM[&periodoId=]
 *
 * El reporte del mes para la contable en Excel: lo que se recibió por método de
 * pago, lo que quedó sin pagar o a medias de las cuotas del mes y, aparte, lo que
 * sigue debiéndose de meses anteriores. Sin `mes`, el mes en curso.
 * Contiene nombres de alumnos y responsables: pide el mismo permiso que el panorama.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const hoy = hoyRD();
  const sp = req.nextUrl.searchParams;
  const mesPedido = sp.get('mes');
  if (mesPedido !== null && !mesValido(mesPedido)) return NextResponse.json({ error: 'El mes debe tener la forma AAAA-MM' }, { status: 400 });
  const mes = mesPedido ?? hoy.slice(0, 7);

  const periodos = await db
    .select({ id: adminEscolarPeriodos.id, activo: adminEscolarPeriodos.activo })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, auth.teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio));
  if (periodos.length === 0) return NextResponse.json({ error: 'Todavía no hay un año escolar' }, { status: 404 });

  const pedido = Number(sp.get('periodoId'));
  const [activo] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, auth.teamId), eq(adminEscolarPeriodos.activo, true))).limit(1);
  const periodoId = periodos.some((p) => p.id === pedido) ? pedido : (activo?.id ?? periodos[0].id);

  const reporte = await reporteMensual(auth.teamId, periodoId, mes, hoy);
  if (!reporte) return NextResponse.json({ error: 'Año escolar no encontrado' }, { status: 404 });

  const buffer = await construirLibroReporte(reporte).xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="colegio-${mes}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
