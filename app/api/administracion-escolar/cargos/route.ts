import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarConceptosPago,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { mesPerteneceAlPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const sp = req.nextUrl.searchParams;
  const periodoId = sp.get('periodoId');
  const estado = sp.get('estado');

  const where = [eq(adminEscolarCargos.teamId, teamId)];
  if (periodoId) where.push(eq(adminEscolarCargos.periodoId, parseInt(periodoId)));
  if (estado) where.push(eq(adminEscolarCargos.estado, estado));

  const rows = await db
    .select({
      id: adminEscolarCargos.id,
      estudianteId: adminEscolarCargos.estudianteId,
      estudiante: adminEscolarEstudiantes.nombres,
      estudianteApellidos: adminEscolarEstudiantes.apellidos,
      matriculaId: adminEscolarCargos.matriculaId,
      periodoId: adminEscolarCargos.periodoId,
      conceptoId: adminEscolarCargos.conceptoId,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      estado: adminEscolarCargos.estado,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .where(and(...where))
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id));
  return NextResponse.json({ cargos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { estudianteId, matriculaId, periodoId, conceptoId, mes, anio, montoCentavos, fechaVencimiento } = await req.json();
  if (!estudianteId || !matriculaId || !periodoId || !conceptoId) {
    return NextResponse.json({ error: 'estudianteId, matriculaId, periodoId y conceptoId son requeridos' }, { status: 400 });
  }
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (!Number.isInteger(anio)) return NextResponse.json({ error: 'anio requerido' }, { status: 400 });
  if (mes != null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: 'mes debe estar entre 1 y 12' }, { status: 400 });
  }

  // Los ids vienen del cliente: sin esto se podría colgar un cargo propio del
  // estudiante o el concepto de OTRO colegio, y el join del listado terminaría
  // mostrando su nombre.
  const ajeno = await validarPertenencia(teamId, {
    estudiante: estudianteId,
    matricula:  matriculaId,
    concepto:   conceptoId,
  });
  if (ajeno) return NextResponse.json({ error: ajeno }, { status: 404 });

  const [periodo] = await db
    .select({ fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  if (mes != null && !mesPerteneceAlPeriodo(periodo.fechaInicio, periodo.fechaFin, mes, anio)) {
    return NextResponse.json({ error: 'El mes seleccionado no pertenece al calendario de este período' }, { status: 400 });
  }

  const [row] = await db.insert(adminEscolarCargos).values({
    teamId,
    estudianteId,
    matriculaId,
    periodoId,
    conceptoId,
    mes: mes ?? null,
    anio,
    montoCentavos,
    saldoCentavos: montoCentavos,
    fechaVencimiento: fechaVencimiento || null,
    estado: 'pendiente',
  }).returning();
  return NextResponse.json({ cargo: row });
}
