import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { devengarPeriodo } from '@/lib/administracion-escolar/devengar';
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';
import { otraColegiatura } from '@/lib/administracion-escolar/cargo-desde-tarifa';
import { hoyRD } from '@/lib/utils/format';
import {
  adminEscolarCargos, adminEscolarConceptoCuotas, adminEscolarConceptosPago,
  adminEscolarEstudiantes, adminEscolarMatriculas, adminEscolarPeriodos,
} from '@/lib/db/schema';

export const maxDuration = 300;

/** Asigna el concepto entero al plan de la matrícula. Sus cuotas siguen el calendario. */
async function datos(teamId: number, periodoId: number, conceptoId: number, cursoIds: number[]) {
  const [periodo, conceptos, cuotas] = await Promise.all([
    db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId))).limit(1),
    // Todos los del colegio y no solo el que se asigna: hace falta saber qué
    // OTRAS colegiaturas tiene ya cada alumno (`otraColegiatura`).
    db.select({
      id: adminEscolarConceptosPago.id,
      tipo: adminEscolarConceptosPago.tipo,
      nombre: adminEscolarConceptosPago.nombre,
      activo: adminEscolarConceptosPago.activo,
    }).from(adminEscolarConceptosPago)
      .where(eq(adminEscolarConceptosPago.teamId, teamId)),
    db.select({ id: adminEscolarConceptoCuotas.id }).from(adminEscolarConceptoCuotas)
      .where(and(eq(adminEscolarConceptoCuotas.teamId, teamId), eq(adminEscolarConceptoCuotas.periodoId, periodoId), eq(adminEscolarConceptoCuotas.conceptoId, conceptoId), eq(adminEscolarConceptoCuotas.activo, true))),
  ]);
  const concepto = conceptos.find((c) => c.id === conceptoId && c.activo);
  if (!periodo[0] || !concepto) return null;
  const matriculas = await db.select({
    id: adminEscolarMatriculas.id,
    estudianteId: adminEscolarMatriculas.estudianteId,
    conceptosIds: adminEscolarMatriculas.conceptosIds,
    nombres: adminEscolarEstudiantes.nombres,
    apellidos: adminEscolarEstudiantes.apellidos,
    codigo: adminEscolarEstudiantes.codigo,
  }).from(adminEscolarMatriculas)
    .innerJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarEstudiantes.id, adminEscolarMatriculas.estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodoId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      inArray(adminEscolarMatriculas.cursoId, cursoIds),
    ));
  return { matriculas, cuotas, concepto, conceptos: new Map(conceptos.map((c) => [c.id, c])) };
}

function parametros(body: Record<string, unknown>) {
  const periodoId = Number(body.periodoId);
  const conceptoId = Number(body.conceptoId);
  const cursoIds = Array.isArray(body.cursoIds) ? [...new Set(body.cursoIds.map(Number))] : [];
  if (!Number.isInteger(periodoId) || periodoId <= 0 || !Number.isInteger(conceptoId) || conceptoId <= 0
    || cursoIds.length === 0 || cursoIds.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return { periodoId, conceptoId, cursoIds };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const revisar = body?.revisar === true;
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: !revisar });
  if (!auth.ok) return auth.response;
  const p = body && parametros(body);
  if (!p) return NextResponse.json({ error: 'Período, concepto y secciones válidos son requeridos.' }, { status: 400 });
  const datosActuales = await datos(auth.teamId, p.periodoId, p.conceptoId, p.cursoIds);
  if (!datosActuales) return NextResponse.json({ error: 'Período o concepto no encontrado.' }, { status: 404 });

  const sinTarifa = new Set<number>();
  for (let i = 0; i < datosActuales.matriculas.length; i += 20) {
    const grupo = datosActuales.matriculas.slice(i, i + 20);
    const tarifas = await Promise.all(grupo.map((m) => resolverTarifa(auth.teamId, m.id, p.conceptoId)));
    grupo.forEach((m, j) => { if (!tarifas[j] || tarifas[j]!.montoCentavos <= 0) sinTarifa.add(m.id); });
  }

  const ids = datosActuales.matriculas.map((m) => m.id);
  const cargos = ids.length ? await db.select({
    matriculaId: adminEscolarCargos.matriculaId, conceptoId: adminEscolarCargos.conceptoId,
    cuotaId: adminEscolarCargos.cuotaId, mes: adminEscolarCargos.mes,
  }).from(adminEscolarCargos).where(and(
    eq(adminEscolarCargos.teamId, auth.teamId),
    inArray(adminEscolarCargos.matriculaId, ids),
    ne(adminEscolarCargos.estado, 'anulado'),
  )) : [];
  const legados = new Map<number, Set<number>>();
  const cuotasDelConcepto = new Set(datosActuales.cuotas.map((c) => c.id));
  const asociadosLegados = new Set<number>();
  /*
   * Un cargo de este concepto puesto a mano sin mes (un cobro suelto, de los
   * de «Agregar cargo» o del antiguo cobro por lote) no lo reconoce el devengo: ni tiene cuota ni
   * cae en el mes de ninguna. Asignar el concepto encima le crearía todas las
   * cuotas además de ese cargo. Esos alumnos no se pueden marcar.
   */
  const conCargoSuelto = new Set<number>();
  for (const c of cargos) {
    if (!c.matriculaId || !c.conceptoId) continue;
    if (!legados.has(c.matriculaId)) legados.set(c.matriculaId, new Set());
    legados.get(c.matriculaId)!.add(c.conceptoId);
    if (c.conceptoId !== p.conceptoId) continue;
    if (cuotasDelConcepto.size === 0 || (c.cuotaId != null && cuotasDelConcepto.has(c.cuotaId))) {
      asociadosLegados.add(c.matriculaId);
    }
    if (cuotasDelConcepto.size > 0 && c.cuotaId == null && c.mes == null) {
      conCargoSuelto.add(c.matriculaId);
    }
  }
  /** Los conceptos que el plan del alumno ya cobra, con el mismo respaldo que el devengo. */
  const delPlan = (m: { id: number; conceptosIds: number[] | null }) => {
    const propios = m.conceptosIds ?? [];
    const ids = propios.length > 0 ? propios : [...(legados.get(m.id) ?? [])];
    return ids.map((id) => datosActuales.conceptos.get(id)).filter((c) => c != null);
  };
  const detalles = datosActuales.matriculas.map((m) => ({
    estudianteId: m.estudianteId,
    matriculaId: m.id,
    nombre: `${m.nombres} ${m.apellidos}`.trim(),
    codigo: m.codigo,
    resultado: ((m.conceptosIds ?? []).includes(p.conceptoId)
      || ((m.conceptosIds ?? []).length === 0 && asociadosLegados.has(m.id))
      ? 'duplicado'
      : conCargoSuelto.has(m.id) ? 'cargo-suelto'
      : sinTarifa.has(m.id) ? 'sin-tarifa' : 'crear') as 'duplicado' | 'cargo-suelto' | 'sin-tarifa' | 'crear',
    otraColegiatura: otraColegiatura(datosActuales.concepto, delPlan(m)),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (revisar) return NextResponse.json({ detalles });

  const estudianteIds = Array.isArray(body.estudianteIds) ? body.estudianteIds : [];
  if (estudianteIds.length === 0 || estudianteIds.some((id: unknown) => !Number.isInteger(id) || Number(id) <= 0)) {
    return NextResponse.json({ error: 'Selecciona al menos un alumno válido.' }, { status: 400 });
  }
  const elegidos = new Set<number>(estudianteIds);
  const permitidos = new Set(detalles.filter((d) => d.resultado === 'crear').map((d) => d.estudianteId));
  if ([...elegidos].some((id) => !permitidos.has(id))) {
    return NextResponse.json({ error: 'La lista cambió. Vuelve a revisar los alumnos.' }, { status: 409 });
  }
  // Una sola transacción: nadie queda asignado a medias. Se conservan los
  // conceptos históricos de matrículas anteriores a conceptos_ids.
  const asignados = await db.transaction(async (tx) => {
    let nuevos = 0;
    for (const m of datosActuales.matriculas.filter((row) => elegidos.has(row.estudianteId))) {
      const [actual] = await tx.select({ conceptosIds: adminEscolarMatriculas.conceptosIds })
        .from(adminEscolarMatriculas)
        .where(and(eq(adminEscolarMatriculas.id, m.id), eq(adminEscolarMatriculas.teamId, auth.teamId)))
        .for('update').limit(1);
      if (!actual || actual.conceptosIds.includes(p.conceptoId)) continue;
      const anteriores = actual.conceptosIds.length > 0
        ? actual.conceptosIds : [...(legados.get(m.id) ?? [])];
      await tx.update(adminEscolarMatriculas).set({
        conceptosIds: [...new Set([...anteriores, p.conceptoId])],
        updatedAt: new Date(),
      }).where(and(eq(adminEscolarMatriculas.id, m.id), eq(adminEscolarMatriculas.teamId, auth.teamId)));
      nuevos += 1;
    }
    return nuevos;
  });
  // Las cuotas con fecha ya alcanzada aparecen como cargo al confirmar; las
  // futuras quedan previstas hasta que el cron diario llegue a su fecha.
  try {
    // Fecha de RD, no UTC: entre las 20:00 y las 24:00 la UTC ya es mañana y
    // crearía hoy la cuota que se emite mañana.
    const devengo = await devengarPeriodo(auth.teamId, p.periodoId, hoyRD(), false, {
        soloMatriculas: datosActuales.matriculas.filter((m) => elegidos.has(m.estudianteId)).map((m) => m.id),
        soloConceptos: [p.conceptoId],
      });
    return NextResponse.json({ asignados, cargosCreados: devengo.cargosCreados });
  } catch {
    // La asignación ya quedó guardada. El cron idempotente reintenta el devengo.
    return NextResponse.json({ asignados, devengoPendiente: true });
  }
}
