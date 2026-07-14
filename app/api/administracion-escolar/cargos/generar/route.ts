import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarMatriculas,
} from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and, inArray, isNull } from 'drizzle-orm';

/**
 * Generación masiva de cargos. Crea un cargo por cada matrícula ACTIVA del
 * período (opcionalmente filtrado por curso), para el concepto/mes/año dados.
 * Los duplicados de una re-ejecución masiva (mismo estudiante+concepto+período+mes)
 * se omiten explícitamente. El cargo individual sí permite repetir mes/concepto
 * cuando la escuela necesita registrar cargos separados.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { periodoId, cursoId, conceptoId, mes, anio, montoCentavos, fechaVencimiento } = await req.json();

  if (!periodoId || !conceptoId || !anio) {
    return NextResponse.json({ error: 'periodoId, conceptoId y anio son requeridos' }, { status: 400 });
  }
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }

  const where = [
    eq(adminEscolarMatriculas.teamId, teamId),
    eq(adminEscolarMatriculas.periodoId, periodoId),
    eq(adminEscolarMatriculas.estado, 'activa'),
  ];
  if (cursoId) where.push(eq(adminEscolarMatriculas.cursoId, cursoId));

  const matriculas = await db
    .select({ id: adminEscolarMatriculas.id, estudianteId: adminEscolarMatriculas.estudianteId })
    .from(adminEscolarMatriculas)
    .where(and(...where));

  if (matriculas.length === 0) {
    return NextResponse.json({ creados: 0, omitidos: 0, total: 0 });
  }

  const existentesWhere = [
    eq(adminEscolarCargos.teamId, teamId),
    eq(adminEscolarCargos.periodoId, periodoId),
    eq(adminEscolarCargos.conceptoId, conceptoId),
    inArray(adminEscolarCargos.estudianteId, matriculas.map((m) => m.estudianteId)),
  ];
  if (mes == null) {
    existentesWhere.push(isNull(adminEscolarCargos.mes));
  } else {
    existentesWhere.push(eq(adminEscolarCargos.mes, mes));
  }

  const existentes = await db
    .select({ estudianteId: adminEscolarCargos.estudianteId })
    .from(adminEscolarCargos)
    .where(and(...existentesWhere));
  const estudiantesConCargo = new Set(existentes.map((e) => e.estudianteId));
  const pendientes = matriculas.filter((m) => !estudiantesConCargo.has(m.estudianteId));

  const values = pendientes.map((m) => ({
    teamId,
    estudianteId: m.estudianteId,
    matriculaId: m.id,
    periodoId,
    conceptoId,
    mes: mes ?? null,
    anio,
    montoCentavos,
    saldoCentavos: montoCentavos,
    fechaVencimiento: fechaVencimiento || null,
    estado: 'pendiente' as const,
  }));

  const creados = values.length === 0
    ? []
    : await db.insert(adminEscolarCargos)
      .values(values)
      .returning({ id: adminEscolarCargos.id });

  return NextResponse.json({
    creados: creados.length,
    omitidos: matriculas.length - creados.length,
    total: matriculas.length,
  });
}
