import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarMatriculas,
} from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Generación masiva de cargos. Crea un cargo por cada matrícula ACTIVA del
 * período (opcionalmente filtrado por curso), para el concepto/mes/año dados.
 * Los duplicados (mismo estudiante+concepto+período+mes) se omiten vía el índice
 * único — se reporta cuántos se crearon y cuántos se saltaron.
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

  const values = matriculas.map((m) => ({
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

  // onConflictDoNothing sobre el índice anti-duplicado → omite los ya existentes.
  const creados = await db.insert(adminEscolarCargos)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: adminEscolarCargos.id });

  return NextResponse.json({
    creados: creados.length,
    omitidos: matriculas.length - creados.length,
    total: matriculas.length,
  });
}
