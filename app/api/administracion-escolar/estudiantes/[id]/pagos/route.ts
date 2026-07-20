import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  ecfDocuments,
  pagosRecibidos,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Cobros de un estudiante (más reciente primero). Fuente de verdad: el ledger
 * `pagos_recibidos` de las facturas vinculadas a sus cargos (no un pago escolar
 * paralelo). Regla del negocio: todo cobro vive en el motor de facturación.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const rows = await db
    .select({
      id: pagosRecibidos.id,
      cargoId: adminEscolarCargos.id,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: pagosRecibidos.montoCentavos,
      fechaPago: pagosRecibidos.fechaPago,
      metodo: pagosRecibidos.metodo,
      referencia: pagosRecibidos.referencia,
      notas: pagosRecibidos.notas,
      createdAt: pagosRecibidos.createdAt,
    })
    .from(adminEscolarCargos)
    .innerJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .innerJoin(pagosRecibidos, and(
      eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id),
      eq(pagosRecibidos.teamId, teamId),
    ))
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, parseInt(id)),
    ))
    .orderBy(desc(pagosRecibidos.fechaPago), desc(pagosRecibidos.id));
  return NextResponse.json({ pagos: rows });
}
