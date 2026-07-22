import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  ecfDocuments,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { eq, and, desc } from 'drizzle-orm';

/** Cargos de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  // Refleja el cobro de las facturas vinculadas en el saldo/estado de cada cargo.
  await sincronizarSaldosDesdeFacturas(teamId, parseInt(id));
  const rows = await db
    .select({
      id: adminEscolarCargos.id,
      conceptoId: adminEscolarCargos.conceptoId,
      concepto: adminEscolarConceptosPago.nombre,
      conceptoTipo: adminEscolarConceptosPago.tipo,
      matriculaId: adminEscolarCargos.matriculaId,
      periodoId: adminEscolarCargos.periodoId,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      facturaClientId: ecfDocuments.clientId,
      facturaEncf: ecfDocuments.encf,
      facturaCodigo: ecfDocuments.codigo,
      facturaEstadoPago: ecfDocuments.estadoPago,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .leftJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, parseInt(id)),
    ))
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id));
  return NextResponse.json({ cargos: rows });
}
