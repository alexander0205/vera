import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarConceptosPago,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
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
    .leftJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(...where))
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id));
  return NextResponse.json({ cargos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { estudianteId, matriculaId, periodoId, conceptoId, mes, anio, montoCentavos, fechaVencimiento } = await req.json();
  if (!estudianteId || !matriculaId || !periodoId || !conceptoId) {
    return NextResponse.json({ error: 'estudianteId, matriculaId, periodoId y conceptoId son requeridos' }, { status: 400 });
  }
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (!anio) return NextResponse.json({ error: 'anio requerido' }, { status: 400 });

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
