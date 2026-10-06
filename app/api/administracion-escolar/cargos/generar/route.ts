import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { mesPerteneceAlPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { eq, and, inArray, isNull, ne } from 'drizzle-orm';

/**
 * Generación masiva de cargos: el mismo concepto a un grupo de alumnos.
 *
 * Es por donde pasa el cobro eventual —el día de cine, la excursión, la
 * evaluación del período—: lo que se le cobra a muchos de una vez y no sale de
 * ninguna tarifa mensual.
 *
 * Dos cosas que antes no tenía, y que son las que hacían que nadie se atreviera
 * a usarlo con el colegio entero delante:
 *
 *  - **`dryRun`**: la revisión. Devuelve alumno por alumno a quién se le va a
 *    crear y a quién se le omite, sin escribir una línea. Antes se pulsaba
 *    «Generar» a ciegas sobre cuatrocientas matrículas y el resultado se leía
 *    después, cuando la deuda ya estaba puesta.
 *  - **`estudianteIds`**: el subconjunto. El filtro llegaba hasta la sección, y
 *    un cobro eventual casi nunca es «toda la sección»: es la lista de los que
 *    van al viaje. Sin esto había que crear el cargo uno a uno.
 *
 * El duplicado se omite igual que siempre (mismo estudiante + concepto +
 * período + mes), pero ya NO cuenta el cargo anulado: anular es la forma de
 * decir «esto no se cobra», y un anulado bloqueando la regeneración dejaba al
 * alumno fuera del cobro para siempre, en silencio.
 */

interface DetalleGeneracion {
  estudianteId: number;
  matriculaId: number;
  nombre: string;
  codigo: string | null;
  /** dryRun: crear | duplicado. Real: creado | duplicado. */
  resultado: 'crear' | 'creado' | 'duplicado';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  // Revisar solo lee; crear de verdad pone deuda cobrable y va con el gate de
  // escritura, igual que el alta en lote de matrículas.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: !dryRun },
  );
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const {
    periodoId, cursoId, cursoIds, estudianteIds,
    conceptoId, mes, anio, montoCentavos, fechaVencimiento,
  } = body ?? {};

  if (!periodoId || !conceptoId || !Number.isInteger(anio)) {
    return NextResponse.json({ error: 'periodoId, conceptoId y anio son requeridos' }, { status: 400 });
  }
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (mes != null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: 'mes debe estar entre 1 y 12' }, { status: 400 });
  }

  // El concepto viene del cliente. Los cursos no hace falta validarlos: solo
  // filtran matrículas que ya están acotadas al team.
  const refs = await validarPertenencia(teamId, { concepto: conceptoId, periodo: periodoId });
  if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 404 });
  // A partir de aquí se usan los ids normalizados, no los crudos del JSON.
  const periodoIdOk = refs.ids.periodo!;
  const conceptoIdOk = refs.ids.concepto!;

  const [periodo] = await db
    .select({ fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoIdOk), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  if (mes != null && !mesPerteneceAlPeriodo(periodo.fechaInicio, periodo.fechaFin, mes, anio)) {
    return NextResponse.json({ error: 'El mes seleccionado no pertenece al calendario de este período' }, { status: 400 });
  }

  const where = [
    eq(adminEscolarMatriculas.teamId, teamId),
    eq(adminEscolarMatriculas.periodoId, periodoIdOk),
    eq(adminEscolarMatriculas.estado, 'activa'),
  ];
  // `cursoId` suelto se mantiene por compatibilidad con quien ya llamaba así.
  const cursos: number[] = Array.isArray(cursoIds)
    ? [...new Set(cursoIds.map(Number).filter(Boolean))]
    : cursoId ? [Number(cursoId)] : [];
  if (cursos.length === 1) where.push(eq(adminEscolarMatriculas.cursoId, cursos[0]));
  else if (cursos.length > 1) where.push(inArray(adminEscolarMatriculas.cursoId, cursos));

  // La lista explícita manda sobre el filtro: es la que se marcó en la revisión.
  const elegidos: number[] = Array.isArray(estudianteIds)
    ? [...new Set(estudianteIds.map(Number).filter(Boolean))]
    : [];
  if (elegidos.length > 0) where.push(inArray(adminEscolarMatriculas.estudianteId, elegidos));

  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      cursoId: adminEscolarMatriculas.cursoId,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      codigo: adminEscolarEstudiantes.codigo,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .where(and(...where));

  if (matriculas.length === 0) {
    return NextResponse.json({ dryRun, creados: 0, omitidos: 0, total: 0, detalles: [] });
  }

  const existentesWhere = [
    eq(adminEscolarCargos.teamId, teamId),
    eq(adminEscolarCargos.periodoId, periodoIdOk),
    eq(adminEscolarCargos.conceptoId, conceptoIdOk),
    // Un cargo anulado no es deuda de nadie: no cuenta como duplicado.
    ne(adminEscolarCargos.estado, 'anulado'),
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

  const detalles: DetalleGeneracion[] = matriculas
    .map((m) => ({
      estudianteId: m.estudianteId,
      matriculaId: m.id,
      nombre: `${m.nombres ?? ''} ${m.apellidos ?? ''}`.trim() || `Estudiante #${m.estudianteId}`,
      codigo: m.codigo ?? null,
      resultado: (estudiantesConCargo.has(m.estudianteId)
        ? 'duplicado'
        : dryRun ? 'crear' : 'creado') as DetalleGeneracion['resultado'],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      creados: pendientes.length,
      omitidos: matriculas.length - pendientes.length,
      total: matriculas.length,
      detalles,
    });
  }

  const values = pendientes.map((m) => ({
    teamId,
    estudianteId: m.estudianteId,
    matriculaId: m.id,
    periodoId: periodoIdOk,
    conceptoId: conceptoIdOk,
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
    dryRun: false,
    creados: creados.length,
    omitidos: matriculas.length - creados.length,
    total: matriculas.length,
    detalles,
  });
}
