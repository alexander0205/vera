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
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';
import { eq, and, desc, count } from 'drizzle-orm';
import { armarPagina, leerPaginacion } from '@/lib/api/paginacion';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const sp = req.nextUrl.searchParams;
  const periodoId = sp.get('periodoId');
  const estado = sp.get('estado');
  // Los cargos de UNA matrícula: lo pide la pantalla de edición para enseñar
  // qué se le está cobrando de verdad a ese alumno, no el plan teórico.
  const matriculaId = sp.get('matriculaId');

  const where = [eq(adminEscolarCargos.teamId, teamId)];
  if (periodoId) where.push(eq(adminEscolarCargos.periodoId, parseInt(periodoId)));
  if (estado) where.push(eq(adminEscolarCargos.estado, estado));
  if (matriculaId) where.push(eq(adminEscolarCargos.matriculaId, parseInt(matriculaId)));

  // Un colegio genera un cargo por alumno, mes y concepto: unos 5.100 al año
  // con 465 alumnos. Sin paginar, esta ruta devolvía todos de golpe.
  const pag = leerPaginacion(req.nextUrl);

  const [rows, [{ total }]] = await Promise.all([
    db
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
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id))
    .limit(pag.limit)
    .offset(pag.offset),

    db.select({ total: count() }).from(adminEscolarCargos).where(and(...where)),
  ]);

  const pagina = armarPagina(rows, total, pag);
  // Se mantiene `cargos` además de `datos` para no romper a quien ya lee esa
  // clave; el paginador nuevo usa el resto de campos.
  return NextResponse.json({ cargos: pagina.datos, ...pagina });
}

export async function POST(req: NextRequest) {
  // Un cargo es deuda que después se cobra con una factura: escritura.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: true },
  );
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { estudianteId, matriculaId, periodoId, conceptoId, mes, anio, montoCentavos, fechaVencimiento } = await req.json();
  if (!estudianteId || !matriculaId || !periodoId || !conceptoId) {
    return NextResponse.json({ error: 'estudianteId, matriculaId, periodoId y conceptoId son requeridos' }, { status: 400 });
  }
  if (montoCentavos != null && (!Number.isInteger(montoCentavos) || montoCentavos <= 0)) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (!Number.isInteger(anio)) return NextResponse.json({ error: 'anio requerido' }, { status: 400 });
  if (mes != null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: 'mes debe estar entre 1 y 12' }, { status: 400 });
  }

  // Los ids vienen del cliente: sin esto se podría colgar un cargo propio del
  // estudiante o el concepto de OTRO colegio, y el join del listado terminaría
  // mostrando su nombre.
  const refs = await validarPertenencia(teamId, {
    estudiante: estudianteId,
    matricula:  matriculaId,
    concepto:   conceptoId,
    periodo:    periodoId,
  });
  if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 404 });

  // Sin monto explícito se resuelve la tarifa: beca del estudiante, si no el
  // precio del grado, si no el del servicio. Que el llamador pueda mandarlo
  // igual deja la puerta abierta al cobro puntual que no sigue la lista.
  let montoFinal = montoCentavos as number | null | undefined;
  if (montoFinal == null) {
    const tarifa = await resolverTarifa(teamId, refs.ids.matricula!, refs.ids.concepto!);
    if (!tarifa) {
      return NextResponse.json(
        { error: 'Este concepto no tiene precio configurado para el grado ni el servicio del estudiante. Ponle un monto o configúralo en Configuración → Conceptos.' },
        { status: 422 },
      );
    }
    montoFinal = tarifa.montoCentavos;
  }
  if (!Number.isInteger(montoFinal) || montoFinal <= 0) {
    return NextResponse.json({ error: 'El monto resuelto no es válido' }, { status: 400 });
  }

  const [periodo] = await db
    .select({ fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, refs.ids.periodo!), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  if (mes != null && !mesPerteneceAlPeriodo(periodo.fechaInicio, periodo.fechaFin, mes, anio)) {
    return NextResponse.json({ error: 'El mes seleccionado no pertenece al calendario de este período' }, { status: 400 });
  }

  // Se insertan los ids YA normalizados por validarPertenencia, no los crudos
  // del JSON: son los mismos que se comprobaron contra el team.
  const [row] = await db.insert(adminEscolarCargos).values({
    teamId,
    estudianteId: refs.ids.estudiante!,
    matriculaId:  refs.ids.matricula!,
    periodoId:    refs.ids.periodo!,
    conceptoId:   refs.ids.concepto!,
    mes: mes ?? null,
    anio,
    montoCentavos: montoFinal,
    saldoCentavos: montoFinal,
    fechaVencimiento: fechaVencimiento || null,
    estado: 'pendiente',
  }).returning();
  return NextResponse.json({ cargo: row });
}
