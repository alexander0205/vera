import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarEstudiantes,
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarGrados,
  adminEscolarServicios,
  adminEscolarCargos,
} from '@/lib/db/schema';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro } from '@/lib/administracion-escolar/plan-cobro';
import { cuotasVigentes, finDeMes } from '@/lib/administracion-escolar/devengar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { eq, and, desc, count } from 'drizzle-orm';
import { armarPagina, leerPaginacion } from '@/lib/api/paginacion';

const ESTADOS = ['activa', 'finalizada', 'retirada', 'anulada'];

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const periodoId = req.nextUrl.searchParams.get('periodoId');

  const where = [eq(adminEscolarMatriculas.teamId, teamId)];
  if (periodoId) where.push(eq(adminEscolarMatriculas.periodoId, parseInt(periodoId)));

  // Una matrícula por alumno y año, y se acumulan curso tras curso. Sin paginar, la ruta devolvía la tabla entera.
  const pag = leerPaginacion(req.nextUrl);

  const [rows, [{ total }]] = await Promise.all([
    db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      estudiante: adminEscolarEstudiantes.nombres,
      estudianteApellidos: adminEscolarEstudiantes.apellidos,
      periodoId: adminEscolarMatriculas.periodoId,
      periodo: adminEscolarPeriodos.nombre,
      cursoId: adminEscolarMatriculas.cursoId,
      // El nombre de una sección es solo la letra, así que la columna "Curso"
      // del listado decía "A" para todo el colegio. El grado y la tanda son
      // los que dicen de qué curso se trata.
      curso: adminEscolarCursos.nombre,
      grado: adminEscolarGrados.nombre,
      servicio: adminEscolarServicios.nombre,
      tanda: adminEscolarServicios.tanda,
      codigoMatricula: adminEscolarMatriculas.codigoMatricula,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      estado: adminEscolarMatriculas.estado,
      notas: adminEscolarMatriculas.notas,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .leftJoin(adminEscolarPeriodos, and(
      eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id),
      eq(adminEscolarPeriodos.teamId, teamId),
    ))
    .leftJoin(adminEscolarCursos, and(
      eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id),
      eq(adminEscolarCursos.teamId, teamId),
    ))
    .leftJoin(adminEscolarGrados, eq(adminEscolarCursos.gradoId, adminEscolarGrados.id))
    .leftJoin(adminEscolarServicios, eq(adminEscolarGrados.servicioId, adminEscolarServicios.id))
    .where(and(...where))
    .orderBy(desc(adminEscolarMatriculas.fechaInscripcion), desc(adminEscolarMatriculas.id))
    .limit(pag.limit)
    .offset(pag.offset),

    db.select({ total: count() }).from(adminEscolarMatriculas).where(and(...where)),
  ]);

  const pagina = armarPagina(rows, total, pag);
  return NextResponse.json({ matriculas: pagina.datos, ...pagina });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const {
    estudianteId, periodoId, cursoId, codigoMatricula, fechaInscripcion, estado, notas,
    becaTipo, becaValor, becaMotivo,
    /**
     * Ids de los conceptos que la secretaria dejó marcados en el panel. Se
     * manda la lista y no un "generar sí/no" porque la decisión es por
     * concepto: casi siempre van todos, pero el uniforme o una actividad
     * puntual se desmarcan.
     *
     * `undefined` (no viene el campo) = no generar nada, que es lo que hacen
     * los llamadores viejos. `[]` = el usuario los desmarcó todos.
     */
    conceptos,
  } = await req.json();
  if (!estudianteId || !periodoId || !cursoId) {
    return NextResponse.json({ error: 'estudianteId, periodoId y cursoId son requeridos' }, { status: 400 });
  }
  // Los tres ids vienen del cliente: hay que confirmar que son de este colegio
  // antes de crear la matrícula.
  const refs = await validarPertenencia(teamId, {
    estudiante: estudianteId,
    periodo:    periodoId,
    curso:      cursoId,
  });
  if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 404 });
  // Ids ya normalizados: son los que se comprobaron contra el team.
  const estudianteIdOk = refs.ids.estudiante!;
  const periodoIdOk    = refs.ids.periodo!;
  const cursoIdOk      = refs.ids.curso!;

  const estadoNorm = ESTADOS.includes(estado) ? estado : 'activa';
  if (estadoNorm === 'activa') {
    const conflicto = await conflictoMatriculaActivaPorPeriodo({ teamId, estudianteId: estudianteIdOk, periodoId: periodoIdOk });
    if (conflicto) return NextResponse.json({ error: conflicto }, { status: 409 });
  }

  const becaTipoOk = becaTipo === 'porcentaje' || becaTipo === 'monto' ? becaTipo : null;
  const becaValorOk = becaTipoOk && Number.isFinite(Number(becaValor)) ? Number(becaValor) : null;
  const inscripcion = fechaInscripcion || new Date().toISOString().slice(0, 10);

  try {
    // Matrícula y cargos en una sola transacción: una matrícula sin su deuda
    // es peor que ninguna, porque nadie se entera de que falta hasta que el
    // padre no recibe la factura.
    const row = await db.transaction(async (tx) => {
      const [matricula] = await tx.insert(adminEscolarMatriculas).values({
        teamId,
        estudianteId: estudianteIdOk,
        periodoId:    periodoIdOk,
        cursoId:      cursoIdOk,
        codigoMatricula: codigoMatricula?.trim() || null,
        fechaInscripcion: fechaInscripcion || null,
        estado: estadoNorm,
        notas: notas?.trim() || null,
        becaTipo: becaTipoOk,
        becaValor: becaValorOk,
        becaMotivo: becaMotivo?.trim() || null,
      }).returning();

      const pedidos: number[] = Array.isArray(conceptos) ? conceptos.map(Number).filter(Boolean) : [];
      if (pedidos.length === 0) return matricula;

      // Se recalcula aquí en vez de fiarse de los montos que mandó el cliente:
      // el navegador puede traer precios viejos, o alterados a mano.
      const ctx = await contextoDeSeccion(teamId, periodoIdOk, cursoIdOk, {
        tipo: becaTipoOk, valor: becaValorOk,
      });
      if (!ctx) return matricula;

      const plan = await armarPlanDeCobro(teamId, ctx, inscripcion);

      // Solo lo que ya entró en vigor. Las diez mensualidades del año NO nacen
      // aquí: el padre que matricula en agosto no debe la cuota de junio, y
      // escribirla como deuda inflaría el saldo pendiente de todo el colegio.
      // El resto lo va creando el devengo mensual cuando llega su mes.
      const hasta = finDeMes(inscripcion);
      const filas = cuotasVigentes(plan, pedidos, hasta).map(({ linea, cuota }) => ({
        teamId,
        estudianteId: estudianteIdOk,
        matriculaId:  matricula.id,
        periodoId:    periodoIdOk,
        conceptoId:   linea.conceptoId,
        // `cuotaId` 0 es el pago único de un concepto sin calendario: no
        // existe como fila, así que se guarda nulo.
        cuotaId:      cuota.cuotaId || null,
        mes:          cuota.mes,
        anio:         Number(cuota.fechaVencimiento.slice(0, 4)),
        montoCentavos: cuota.montoCentavos,
        // Nace debiéndose entero. Matricular no cobra: el dinero se mueve
        // después, en Pagos.
        saldoCentavos: cuota.montoCentavos,
        fechaVencimiento: cuota.fechaVencimiento,
        estado: 'pendiente',
      }));

      if (filas.length > 0) {
        // `onConflictDoNothing` contra el índice (matricula_id, cuota_id): si
        // el usuario da dos clics o reintenta tras un error de red, la segunda
        // pasada no le vuelve a cobrar al padre.
        await tx.insert(adminEscolarCargos).values(filas).onConflictDoNothing();
      }
      return matricula;
    });

    return NextResponse.json({ matricula: row });
  } catch (err: unknown) {
    // Choque con el índice parcial: ya hay una matrícula activa en ese período.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: 'El estudiante ya tiene una matrícula activa en este período.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
