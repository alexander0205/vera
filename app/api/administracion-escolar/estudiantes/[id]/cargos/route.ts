import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  ecfDocuments,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { eq, and, desc } from 'drizzle-orm';

/** Cargos de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  // Refleja el cobro de las facturas vinculadas en el saldo/estado de cada cargo.
  await sincronizarSaldosDesdeFacturas(teamId, parseInt(id));
  const rows = await db
    .select({
      id: adminEscolarCargos.id,
      conceptoId: adminEscolarCargos.conceptoId,
      concepto: adminEscolarConceptosPago.nombre,
      matriculaId: adminEscolarCargos.matriculaId,
      periodoId: adminEscolarCargos.periodoId,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      facturaEncf: ecfDocuments.encf,
      facturaCodigo: ecfDocuments.codigo,
      facturaEstadoPago: ecfDocuments.estadoPago,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .leftJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, parseInt(id)),
    ))
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id));
  return NextResponse.json({ cargos: rows });
}
