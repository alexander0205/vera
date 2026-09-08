import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro } from '@/lib/administracion-escolar/plan-cobro';
import { cuotasVigentes, finDeMes } from '@/lib/administracion-escolar/devengar';
import { crearMatriculaConCargos } from '@/lib/administracion-escolar/matricula-alta';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { and, eq, inArray } from 'drizzle-orm';

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
 */

interface ResultadoLote {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  /** dryRun: crear | conflicto | invalido. Real: creada | conflicto | invalido | error. */
  resultado: 'crear' | 'creada' | 'conflicto' | 'invalido' | 'error';
  motivo?: string;
  matriculaId?: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  // La revisión (dryRun) solo lee; crear de verdad mueve deuda cobrable y va con
  // el gate de escritura.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: !dryRun },
  );
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const {
    periodoId, cursoId, fechaInscripcion, documentoListaId, notas, conceptos, estudianteIds,
  } = body ?? {};

  if (!periodoId || !cursoId) {
    return NextResponse.json({ error: 'periodoId y cursoId son requeridos' }, { status: 400 });
  }
  const ids: number[] = Array.isArray(estudianteIds)
    ? [...new Set(estudianteIds.map(Number).filter(Boolean))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un estudiante' }, { status: 400 });
  }

  // Período y curso se comprueban UNA vez: son los mismos para todo el grupo.
  const refs = await validarPertenencia(teamId, { periodo: periodoId, curso: cursoId });
  if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 404 });
  const periodoIdOk = refs.ids.periodo!;
  const cursoIdOk   = refs.ids.curso!;

  const inscripcion = fechaInscripcion || new Date().toISOString().slice(0, 10);
  const pedidos: number[] = Array.isArray(conceptos) ? conceptos.map(Number).filter(Boolean) : [];

  // Plan de cobro de la sección, calculado una sola vez. Sin él (sección sin
  // tarifa) las matrículas se crean sin cargos, igual que en el alta individual.
  const ctx = pedidos.length > 0
    ? await contextoDeSeccion(teamId, periodoIdOk, cursoIdOk)
    : null;
  const plan = ctx ? await armarPlanDeCobro(teamId, ctx, inscripcion) : [];

  // Lo que va a deber cada alumno del grupo: el mismo total para todos, porque
  // comparten sección y fecha. Se enseña en la revisión.
  const cuotas = cuotasVigentes(plan, pedidos, finDeMes(inscripcion));
  const cargoTotalCentavos = cuotas.reduce((s, { cuota }) => s + cuota.montoCentavos, 0);
  const cargoCount = cuotas.length;

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
        conceptos: pedidos,
      }, plan);
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

  return NextResponse.json({ dryRun, resumen, cargoTotalCentavos, cargoCount, resultados });
}
