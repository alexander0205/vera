import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPagos,
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarConceptosPago,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const estudianteId = req.nextUrl.searchParams.get('estudianteId');

  const where = [eq(adminEscolarPagos.teamId, teamId)];
  if (estudianteId) where.push(eq(adminEscolarPagos.estudianteId, parseInt(estudianteId)));

  const rows = await db
    .select({
      id: adminEscolarPagos.id,
      estudianteId: adminEscolarPagos.estudianteId,
      estudiante: adminEscolarEstudiantes.nombres,
      estudianteApellidos: adminEscolarEstudiantes.apellidos,
      cargoId: adminEscolarPagos.cargoId,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarPagos.montoCentavos,
      fechaPago: adminEscolarPagos.fechaPago,
      metodo: adminEscolarPagos.metodo,
      referencia: adminEscolarPagos.referencia,
      notas: adminEscolarPagos.notas,
      createdAt: adminEscolarPagos.createdAt,
    })
    .from(adminEscolarPagos)
    .leftJoin(adminEscolarEstudiantes, eq(adminEscolarPagos.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(adminEscolarCargos, eq(adminEscolarPagos.cargoId, adminEscolarCargos.id))
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(...where))
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.id));
  return NextResponse.json({ pagos: rows });
}

/**
 * DEPRECADO. El módulo escolar ya no registra pagos propios: todo cobro va
 * atado a la factura y vive en el ledger `pagos_recibidos` del motor de
 * facturación (regla de Alex — no crear un sistema de cobro paralelo). Para
 * cobrar un cargo: vincúlalo a una factura y registra el cobro en la factura
 * (/dashboard/facturas/[id] o Cuentas por Cobrar). El saldo del cargo se
 * refleja de la factura vía sincronizarSaldosDesdeFacturas.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Los pagos escolares se registran en la factura vinculada, no aquí. Abre la factura del cargo para cobrar.' },
    { status: 409 },
  );
}
