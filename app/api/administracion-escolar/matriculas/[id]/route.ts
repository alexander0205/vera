import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarCargos,
  adminEscolarPagos,
  adminEscolarConceptosPago,
  adminEscolarEstudiantes,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { eq, and, count, inArray, isNotNull } from 'drizzle-orm';

const ESTADOS = ['activa', 'finalizada', 'retirada', 'anulada'];

/**
 * Una matrícula con lo que hace falta para editarla: su curso, su estado y los
 * conceptos recurrentes que se le están cobrando.
 *
 * El listado (`GET /matriculas`) no trae `conceptosIds` —son cientos de filas y
 * nadie los mira ahí—, así que el diálogo de edición no tenía de dónde sacar
 * qué se le cobra a ESTE alumno todos los meses.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const matriculaId = parseInt(id, 10);
  if (!Number.isFinite(matriculaId)) {
    return NextResponse.json({ error: 'Matrícula no válida' }, { status: 400 });
  }

  const [row] = await db.select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodoId: adminEscolarMatriculas.periodoId,
      cursoId: adminEscolarMatriculas.cursoId,
      documentoListaId: adminEscolarMatriculas.documentoListaId,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      estado: adminEscolarMatriculas.estado,
      codigoMatricula: adminEscolarMatriculas.codigoMatricula,
      notas: adminEscolarMatriculas.notas,
      conceptosIds: adminEscolarMatriculas.conceptosIds,
      conceptoMensualidadId: adminEscolarMatriculas.conceptoMensualidadId,
    })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ matricula: row });
}

/**
 * Edita una matrícula existente (período, curso, fecha de inscripción, estado,
 * código, notas). NO toca el código del estudiante: éste queda ligado al año de
 * la PRIMERA inscripción y es inmutable — cambiar aquí el período de una
 * matrícula ya creada no lo regenera.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const {
    periodoId, cursoId, documentoListaId, fechaInscripcion, estado, codigoMatricula, notas,
    becaTipo, becaValor, becaMotivo, conceptoMensualidadId,
    estudianteId, conceptosIds,
  } = await req.json();
  const matriculaId = parseInt(id, 10);
  const [actual] = await db.select({ estudianteId: adminEscolarMatriculas.estudianteId, periodoId: adminEscolarMatriculas.periodoId, estado: adminEscolarMatriculas.estado, conceptosIds: adminEscolarMatriculas.conceptosIds })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  /**
   * Cambiar de alumno una matrícula ya creada.
   *
   * No estaba, y hacía falta: se matricula al hermano equivocado —dos niños de
   * la misma familia, el mismo apellido, el mismo grado— y la única salida era
   * borrar la matrícula, que el sistema niega en cuanto tiene un cargo. La
   * familia se quedaba con la deuda colgando del niño que no era.
   *
   * Se permite SOLO mientras la matrícula no haya movido dinero de verdad: sin
   * factura emitida y sin un peso cobrado. Con una factura detrás, el alumno
   * que figura es el del e-CF y eso ya no se corrige por aquí.
   *
   * Los cargos se mudan con ella: cuelgan del estudiante además de la
   * matrícula, y dejarlos atrás partiría la deuda entre los dos niños.
   */
  let estudianteFinal = actual.estudianteId;
  if (estudianteId !== undefined && Number(estudianteId) !== actual.estudianteId) {
    const nuevoEstudianteId = Number(estudianteId);
    if (!Number.isInteger(nuevoEstudianteId) || nuevoEstudianteId <= 0) {
      return NextResponse.json({ error: 'Estudiante no válido' }, { status: 400 });
    }
    const [alumno] = await db.select({ id: adminEscolarEstudiantes.id })
      .from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.id, nuevoEstudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
      .limit(1);
    if (!alumno) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });

    const [facturados] = await db.select({ n: count() })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.matriculaId, matriculaId),
        eq(adminEscolarCargos.teamId, teamId),
        isNotNull(adminEscolarCargos.ecfDocumentId),
      ));
    if ((facturados?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Esta matrícula ya tiene cargos facturados: no se le puede cambiar el estudiante. Anula las facturas o crea la matrícula en el alumno correcto.' },
        { status: 409 },
      );
    }
    const [cobrados] = await db.select({ n: count() })
      .from(adminEscolarPagos)
      .where(and(eq(adminEscolarPagos.matriculaId, matriculaId), eq(adminEscolarPagos.teamId, teamId)));
    if ((cobrados?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Esta matrícula ya tiene pagos registrados: no se le puede cambiar el estudiante.' },
        { status: 409 },
      );
    }
    estudianteFinal = nuevoEstudianteId;
  }

  /**
   * Los conceptos RECURRENTES de la matrícula: lo que se le va a ir cobrando
   * mes a mes además de la colegiatura —la sala de tareas, el transporte, el
   * comedor—. Es la lista que lee el devengo; añadir uno aquí hace que sus
   * cuotas aparezcan en el plan y se vuelvan deuda cuando llegue su mes.
   *
   * Solo se podía elegir al matricular. Quitar uno no borra lo ya cargado: deja
   * de generarse hacia adelante, y los cargos viejos se anulan donde se anulan.
   */
  let conceptosSet: number[] | null = null;
  if (Array.isArray(conceptosIds)) {
    const pedidos = [...new Set(conceptosIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (pedidos.length > 0) {
      const existentes = await db.select({ id: adminEscolarConceptosPago.id })
        .from(adminEscolarConceptosPago)
        .where(and(
          eq(adminEscolarConceptosPago.teamId, teamId),
          inArray(adminEscolarConceptosPago.id, pedidos),
        ));
      if (existentes.length !== pedidos.length) {
        return NextResponse.json({ error: 'Alguno de los conceptos no es de este colegio.' }, { status: 404 });
      }
    }
    conceptosSet = pedidos;
  }

  /**
   * La GENERACIÓN del alumno (concepto de mensualidad). Es su ubicación —lo que
   * la ficha muestra como «1ra/2da/3ra…»—, NO su precio: el importe sigue
   * saliendo de la tarifa/monto propio. Cambiarla reescribe `conceptosIds` para
   * dejar SOLO esta mensualidad (más los conceptos que no son mensualidad, que
   * se conservan), y fija `conceptoMensualidadId`. Así se elige la generación y
   * el precio personal en un mismo sitio, sin arrastrar la tarifa de la generación.
   */
  let generacionSet: { conceptoMensualidadId: number; conceptosIds: number[] } | null = null;
  if (conceptoMensualidadId !== undefined && conceptoMensualidadId !== null) {
    const nuevoId = Number(conceptoMensualidadId);
    const [concepto] = await db
      .select({ id: adminEscolarConceptosPago.id, tipo: adminEscolarConceptosPago.tipo })
      .from(adminEscolarConceptosPago)
      .where(and(eq(adminEscolarConceptosPago.id, nuevoId), eq(adminEscolarConceptosPago.teamId, teamId)))
      .limit(1);
    if (!concepto || concepto.tipo !== 'mensualidad') {
      return NextResponse.json({ error: 'La generación debe ser un concepto de mensualidad del colegio.' }, { status: 400 });
    }
    // Conserva los conceptos que NO son mensualidad; reemplaza la mensualidad
    // vieja (cualquiera) por la elegida, sin duplicar.
    const idsActuales = (conceptosSet ?? actual.conceptosIds ?? []).map(Number);
    const mensualidadIds = new Set(
      (await db.select({ id: adminEscolarConceptosPago.id })
        .from(adminEscolarConceptosPago)
        .where(and(eq(adminEscolarConceptosPago.teamId, teamId), eq(adminEscolarConceptosPago.tipo, 'mensualidad'))))
        .map((c) => c.id),
    );
    const noMensualidad = idsActuales.filter((cid) => !mensualidadIds.has(cid));
    generacionSet = { conceptoMensualidadId: nuevoId, conceptosIds: [nuevoId, ...noMensualidad] };
  }

  // Validar período/curso (si vienen) contra el team.
  if (periodoId !== undefined) {
    const [per] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, Number(periodoId)), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
    if (!per) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  }
  if (cursoId !== undefined) {
    const [cur] = await db.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.id, Number(cursoId)), eq(adminEscolarCursos.teamId, teamId))).limit(1);
    if (!cur) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
  }
  const periodoFinal = periodoId === undefined ? actual.periodoId : Number(periodoId);
  const estadoFinal = estado !== undefined && ESTADOS.includes(estado) ? estado : actual.estado;
  if (estadoFinal === 'activa') {
    const conflicto = await conflictoMatriculaActivaPorPeriodo({
      teamId, estudianteId: estudianteFinal, periodoId: periodoFinal, excluirMatriculaId: matriculaId,
    });
    if (conflicto) return NextResponse.json({ error: conflicto }, { status: 409 });
  }

  /**
   * La beca, editable después de matricular.
   *
   * Antes solo se admitía al crear la matrícula, y no había forma de ponerla
   * luego: el PATCH la ignoraba y borrar la matrícula para rehacerla devuelve
   * 409 en cuanto tiene un cargo. O sea que un colegio que aprueba una beca en
   * octubre —que es cuando se aprueban, no en agosto— se quedaba sin dónde
   * anotarla.
   *
   * Mismas reglas que el alta, para que no haya dos verdades: solo
   * 'porcentaje' o 'monto', y el valor solo cuenta si hay tipo. Mandar
   * `becaTipo: null` la quita, y con ella el valor y el motivo — una beca sin
   * tipo no es media beca, es ninguna.
   */
  const tocaBeca = becaTipo !== undefined || becaValor !== undefined || becaMotivo !== undefined;
  const becaTipoOk = becaTipo === 'porcentaje' || becaTipo === 'monto' ? becaTipo : null;
  const becaValorOk = becaTipoOk && Number.isFinite(Number(becaValor)) ? Number(becaValor) : null;

  if (tocaBeca && becaTipo != null && !becaTipoOk) {
    return NextResponse.json(
      { error: 'La beca solo puede ser «porcentaje» o «monto».' },
      { status: 400 },
    );
  }
  if (becaTipoOk && becaValorOk == null) {
    return NextResponse.json(
      { error: 'Una beca necesita su valor: el porcentaje, o el monto en centavos.' },
      { status: 400 },
    );
  }
  if (becaTipoOk === 'porcentaje' && (becaValorOk! <= 0 || becaValorOk! > 100)) {
    return NextResponse.json(
      { error: 'El porcentaje de beca tiene que estar entre 1 y 100.' },
      { status: 400 },
    );
  }
  if (becaTipoOk === 'monto' && becaValorOk! <= 0) {
    return NextResponse.json(
      { error: 'El monto de la beca tiene que ser mayor que cero.' },
      { status: 400 },
    );
  }

  try {
    const [row] = await db.update(adminEscolarMatriculas)
      .set({
        ...(estudianteFinal !== actual.estudianteId ? { estudianteId: estudianteFinal } : {}),
        ...(conceptosSet && !generacionSet ? { conceptosIds: conceptosSet } : {}),
        ...(periodoId !== undefined ? { periodoId: Number(periodoId) } : {}),
        ...(cursoId !== undefined ? { cursoId: Number(cursoId) } : {}),
        ...(documentoListaId !== undefined
          ? { documentoListaId: Number(documentoListaId) || null } : {}),
        ...(fechaInscripcion !== undefined ? { fechaInscripcion: fechaInscripcion || null } : {}),
        ...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),
        ...(codigoMatricula !== undefined ? { codigoMatricula: codigoMatricula?.trim() || null } : {}),
        ...(notas !== undefined ? { notas: notas?.trim() || null } : {}),
        ...(tocaBeca ? {
          becaTipo:   becaTipoOk,
          becaValor:  becaValorOk,
          // El motivo se guarda solo si la beca existe: dejarlo suelto tras
          // quitarla deja en la ficha el porqué de algo que ya no está.
          becaMotivo: becaTipoOk ? (String(becaMotivo ?? '').trim() || null) : null,
        } : {}),
        ...(generacionSet ? {
          conceptoMensualidadId: generacionSet.conceptoMensualidadId,
          conceptosIds:          generacionSet.conceptosIds,
        } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
      .returning();

    // Los cargos cuelgan del estudiante además de la matrícula: si se quedaran
    // atrás, la deuda saldría en la ficha del niño equivocado.
    if (estudianteFinal !== actual.estudianteId) {
      await db.update(adminEscolarCargos)
        .set({ estudianteId: estudianteFinal, updatedAt: new Date() })
        .where(and(eq(adminEscolarCargos.matriculaId, matriculaId), eq(adminEscolarCargos.teamId, teamId)));
    }

    return NextResponse.json({ matricula: row });
  } catch (err: unknown) {
    // Choque con el índice parcial: ya hay otra matrícula activa en ese período.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: 'El estudiante ya tiene otra matrícula activa en este período.' },
        { status: 409 },
      );
    }
    throw err;
  }
}

/**
 * Borra una matrícula, solo si nunca movió dinero.
 *
 * Existe para deshacer el error de dedo —matriculaste al alumno en la sección
 * equivocada y quieres que no quede rastro—, no para dar de baja a nadie. Para
 * eso está el estado: `retirada` si el alumno se fue, `anulada` si la matrícula
 * no debió existir. Ambas conservan el historial, que es lo que un colegio
 * necesita cuando alguien pide una certificación tres años después.
 *
 * Por eso se niega en cuanto hay cargos, pagos o un plan de mensualidad
 * colgando: borrar ahí dejaría deuda y cobros apuntando a una matrícula que ya
 * no existe, y el plan seguiría generando cargos huérfanos cada mes.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const matriculaId = parseInt(id, 10);
  if (!Number.isFinite(matriculaId)) {
    return NextResponse.json({ error: 'Matrícula no válida' }, { status: 400 });
  }

  const [actual] = await db
    .select({ id: adminEscolarMatriculas.id, facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const [[cargos], [pagos]] = await Promise.all([
    db.select({ total: count() }).from(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.matriculaId, matriculaId), eq(adminEscolarCargos.teamId, teamId))),
    db.select({ total: count() }).from(adminEscolarPagos)
      .where(and(eq(adminEscolarPagos.matriculaId, matriculaId), eq(adminEscolarPagos.teamId, teamId))),
  ]);

  if (pagos.total > 0) {
    return NextResponse.json({
      error: `No se puede borrar: tiene ${pagos.total} pago(s) registrado(s). Cámbiale el estado a "anulada" o "retirada".`,
    }, { status: 409 });
  }
  if (cargos.total > 0) {
    return NextResponse.json({
      error: `No se puede borrar: tiene ${cargos.total} cargo(s) generado(s). Anula los cargos primero, o cámbiale el estado a "anulada".`,
    }, { status: 409 });
  }
  if (actual.facturaRecurrenteId) {
    return NextResponse.json({
      error: 'No se puede borrar: tiene un plan de mensualidad activo. Quítale el plan primero.',
    }, { status: 409 });
  }

  await db.delete(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)));
  return NextResponse.json({ ok: true });
}
