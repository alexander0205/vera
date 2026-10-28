/**
 * GET /api/administracion-escolar/responsables/[id]/sin-facturar → { cargoIds, estudianteId }
 *
 * Los cargos de los alumnos de una familia que todavía se pueden facturar:
 * con saldo, sin factura y sin anular. «Nueva factura» los pide al escoger el
 * contacto, para que el buscador de productos ofrezca cada mensualidad con el
 * precio de su alumno (lo mismo que ya hacía al abrirse desde la familia).
 * `estudianteId` es un hijo con matrícula activa: con él se piden los meses
 * que todavía no salen aunque no quede nada sin facturar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarEstudiantes, adminEscolarMatriculas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/** Los mismos que la ficha de la familia ofrece al buscador. */
const COBRABLES = ['pendiente', 'parcial', 'vencido'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 'pagos', como el prefill que se pide después con estos ids.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const filas = await db
    .select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
    .where(and(
      eq(adminEscolarCargos.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.facturarAClientId, clientId),
      isNull(adminEscolarCargos.ecfDocumentId),
      gt(adminEscolarCargos.saldoCentavos, 0),
      inArray(adminEscolarCargos.estado, COBRABLES),
    ))
    .limit(500);
  const [hijo] = await db
    .select({ id: adminEscolarEstudiantes.id })
    .from(adminEscolarEstudiantes)
    .innerJoin(adminEscolarMatriculas, and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarMatriculas.teamId, auth.teamId),
      eq(adminEscolarMatriculas.estado, 'activa'),
    ))
    .where(and(eq(adminEscolarEstudiantes.teamId, auth.teamId), eq(adminEscolarEstudiantes.facturarAClientId, clientId)))
    .limit(1);
  return NextResponse.json({ cargoIds: filas.map((f) => f.id), estudianteId: hijo?.id ?? null });
}
