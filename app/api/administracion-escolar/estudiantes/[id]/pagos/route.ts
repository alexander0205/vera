import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPagos,
  adminEscolarCargos,
  adminEscolarConceptosPago,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

/** Pagos de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const rows = await db
    .select({
      id: adminEscolarPagos.id,
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
    .leftJoin(adminEscolarCargos, eq(adminEscolarPagos.cargoId, adminEscolarCargos.id))
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(
      eq(adminEscolarPagos.teamId, teamId),
      eq(adminEscolarPagos.estudianteId, parseInt(id)),
    ))
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.id));
  return NextResponse.json({ pagos: rows });
}
