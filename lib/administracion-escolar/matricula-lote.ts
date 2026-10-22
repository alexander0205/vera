import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptoPrecios, adminEscolarEstudiantes } from '@/lib/db/schema';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro } from '@/lib/administracion-escolar/plan-cobro';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';
import { crearMatriculaConCargos } from '@/lib/administracion-escolar/matricula-alta';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';

/**
 * Matricular en lote: varios estudiantes en la MISMA sección, con el MISMO plan
 * de cobro, de una sola pasada. Alumnos de grados distintos se hacen en grupos
 * distintos (un lote por sección), porque el plan de cobro es el de la sección.
 *
 * El plan se calcula UNA vez y se reutiliza para todo el grupo: todos van a la
 * misma sección con la misma fecha, así que deben lo mismo.
 *
 * Con `dryRun` no escribe nada: devuelve la revisión —quién se puede matricular
 * y quién choca con una matrícula activa— para enseñarla antes de confirmar.
 *
 * Vive aquí y no en la ruta porque lo usan dos: el diálogo «Matricular en lote»
 * y «Matricular desde SIGERD», que corre un lote por cada sección del portal.
 */

export interface ResultadoLote {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  /** dryRun: crear | conflicto | invalido. Real: creada | conflicto | invalido | error. */
  resultado: 'crear' | 'creada' | 'conflicto' | 'invalido' | 'error';
  motivo?: string;
  matriculaId?: number;
}

export interface RespuestaLote {
  dryRun: boolean;
  resumen: { total: number; crear: number; conflicto: number; invalido: number; error: number };
  cargoTotalCentavos: number;
  cargoCount: number;
  resultados: ResultadoLote[];
}

export class LoteError extends Error {
  constructor(mensaje: string, public status: number) {
    super(mensaje);
    this.name = 'LoteError';
  }
}

export async function matricularLote(params: {
  teamId: number;
  periodoId: unknown;
  cursoId: unknown;
  estudianteIds: number[];
  /**
   * Conceptos que se cobran. `'todos'` = todos los que tienen tarifa en la
   * sección, que es lo que el selector de plan deja marcado por defecto.
   */
  conceptos: number[] | 'todos';
  fechaInscripcion?: string | null;
  documentoListaId?: number | null;
  notas?: string | null;
  /**
   * Lo que cambia para un alumno concreto del grupo: los conceptos que se le
   * cobran a ÉL (al que no usa transporte se le quita). Quien no tiene entrada
   * va con lo del grupo.
   */
  porEstudiante?: Map<number, { conceptos: number[] }>;
  dryRun: boolean;
}): Promise<RespuestaLote> {
  const { teamId, estudianteIds: ids, fechaInscripcion, documentoListaId, notas, dryRun } = params;

  if (!params.periodoId || !params.cursoId) throw new LoteError('periodoId y cursoId son requeridos', 400);
  if (ids.length === 0) throw new LoteError('Selecciona al menos un estudiante', 400);

  // Período y curso se comprueban UNA vez: son los mismos para todo el grupo.
  const refs = await validarPertenencia(teamId, { periodo: params.periodoId, curso: params.cursoId });
  if (!refs.ok) throw new LoteError(refs.error, 404);
  const periodoIdOk = refs.ids.periodo!;
  const cursoIdOk   = refs.ids.curso!;

  const inscripcion = fechaInscripcion || new Date().toISOString().slice(0, 10);
  const todos = params.conceptos === 'todos';
  const pedidosCrudos = todos ? [] : (params.conceptos as number[]);

  // Plan de cobro de la sección, calculado una sola vez. Sin él (sección sin
  // tarifa) las matrículas se crean sin cargos, igual que en el alta individual.
  const ctx = todos || pedidosCrudos.length > 0
    ? await contextoDeSeccion(teamId, periodoIdOk, cursoIdOk)
    : null;
  const plan = ctx ? await armarPlanDeCobro(teamId, ctx, inscripcion) : [];
  const pedidos = todos ? [...new Set(plan.map((l) => l.conceptoId))] : pedidosCrudos;

  // Lo que va a deber cada alumno del grupo: el mismo total para todos, porque
  // comparten sección y fecha. Se enseña en la revisión, y sale de la misma
  // regla con la que `crearMatriculaConCargos` crea los cargos: lo que se
  // confirma es lo que queda.
  const { ahora } = cuotasAlMatricular(plan, pedidos, inscripcion);
  const cargoTotalCentavos = sumaCentavos(ahora);
  const cargoCount = ahora.length;

  // Solo estudiantes de ESTE colegio y activos. Un id que no vuelva de aquí no
  // es de este team (o está inactivo): se marca inválido y no se toca.
  const encontrados = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      codigo: adminEscolarEstudiantes.codigo,
      estado: adminEscolarEstudiantes.estado,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.id, ids),
    ));
  const porId = new Map(encontrados.map((e) => [e.id, e]));

  // Quien tiene tarifa PERSONAL de algún concepto este año no puede usar el
  // plan del grupo: ese plan sale de la tarifa de la sección y su precio propio
  // no estaría. Se le arma el suyo, como hace el alta individual al pasar el
  // alumno. Una consulta para todo el grupo; casi nunca hay ninguno.
  const conPrecioPropio = ctx
    ? new Set((await db
        .selectDistinct({ id: adminEscolarConceptoPrecios.objetivoId })
        .from(adminEscolarConceptoPrecios)
        .where(and(
          eq(adminEscolarConceptoPrecios.teamId, teamId),
          eq(adminEscolarConceptoPrecios.periodoId, periodoIdOk),
          eq(adminEscolarConceptoPrecios.objetivoTipo, 'estudiante'),
          eq(adminEscolarConceptoPrecios.activo, true),
          inArray(adminEscolarConceptoPrecios.objetivoId, ids),
        ))).map((r) => r.id))
    : new Set<number>();

  const resultados: ResultadoLote[] = [];

  for (const id of ids) {
    const est = porId.get(id);
    const nombre = est ? `${est.nombres} ${est.apellidos}`.trim() : `Estudiante #${id}`;
    const codigo = est?.codigo ?? null;

    if (!est || est.estado !== 'activo') {
      resultados.push({ estudianteId: id, nombre, codigo, resultado: 'invalido',
        motivo: est ? 'El estudiante no está activo' : 'El estudiante no es de este colegio' });
      continue;
    }

    // Una matrícula activa por alumno y año. Se comprueba siempre —también en la
    // creación real— para no tumbar el lote con una excepción de la base.
    const conflicto = await conflictoMatriculaActivaPorPeriodo({
      teamId, estudianteId: id, periodoId: periodoIdOk,
    });
    if (conflicto) {
      resultados.push({ estudianteId: id, nombre, codigo, resultado: 'conflicto', motivo: conflicto });
      continue;
    }

    if (dryRun) {
      resultados.push({ estudianteId: id, nombre, codigo, resultado: 'crear' });
      continue;
    }

    // Su plan y sus conceptos, si no son los del grupo. Los conceptos se
    // recortan a los que su plan cobra: un id que no tenga tarifa aquí no es
    // algo que se le pueda cargar.
    const planAlumno = ctx && conPrecioPropio.has(id)
      ? await armarPlanDeCobro(teamId, { ...ctx, estudianteId: id }, inscripcion)
      : plan;
    const suyos = params.porEstudiante?.get(id)?.conceptos;
    const enPlan = new Set(planAlumno.map((l) => l.conceptoId));
    const pedidosAlumno = suyos ? suyos.filter((c) => enPlan.has(c)) : pedidos;

    // Cada alumno en su propia transacción: si uno choca (carrera con otra alta),
    // los demás del lote siguen matriculándose igual.
    try {
      const matricula = await crearMatriculaConCargos({
        teamId,
        estudianteId: id,
        periodoId: periodoIdOk,
        cursoId: cursoIdOk,
        documentoListaId: Number(documentoListaId) || null,
        // El código de matrícula es único por alumno; en lote no se teclea uno,
        // se deja que cada matrícula lo derive como en el alta individual.
        codigoMatricula: null,
        fechaInscripcion: fechaInscripcion || null,
        inscripcionEfectiva: inscripcion,
        estado: 'activa',
        notas: notas?.trim() || null,
        becaTipo: null,
        becaValor: null,
        becaMotivo: null,
        conceptos: pedidosAlumno,
      }, planAlumno);
      resultados.push({ estudianteId: id, nombre, codigo, resultado: 'creada', matriculaId: matricula.id });
    } catch (err: unknown) {
      // Choque con el índice parcial: alguien lo matriculó entremedio.
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        resultados.push({ estudianteId: id, nombre, codigo, resultado: 'conflicto',
          motivo: 'El estudiante ya tiene una matrícula activa en este período.' });
      } else {
        console.error('[matriculas/lote] error creando matrícula', id, err);
        resultados.push({ estudianteId: id, nombre, codigo, resultado: 'error',
          motivo: 'No se pudo crear la matrícula' });
      }
    }
  }

  const resumen = {
    total: resultados.length,
    // 'crear' es el estimado del dryRun; 'creada' el hecho real.
    crear:     resultados.filter((r) => r.resultado === 'crear' || r.resultado === 'creada').length,
    conflicto: resultados.filter((r) => r.resultado === 'conflicto').length,
    invalido:  resultados.filter((r) => r.resultado === 'invalido').length,
    error:     resultados.filter((r) => r.resultado === 'error').length,
  };

  return { dryRun, resumen, cargoTotalCentavos, cargoCount, resultados };
}
