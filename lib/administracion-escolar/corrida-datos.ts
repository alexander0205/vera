/**
 * Lo que la corrida de avisos lee de la base.
 *
 * Aparte de `corrida-avisos.ts` (que es puro) para que las reglas se prueben
 * sin base. Aquí solo hay consultas, y pocas: el costo del cron es por COLEGIO,
 * no por alumno. Un colegio de 400 alumnos son seis lecturas, no cuatrocientas.
 *
 * Todo es lectura salvo `registrarEnvio`, que escribe la fila de idempotencia.
 */

import { and, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptoCuotas,
  adminEscolarConceptoPrecios,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarGrados,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  auditLogs,
  ecfDocuments,
  facturasRecurrentes,
  teamMembers,
  teams,
  users,
} from '@/lib/db/schema';
import { sumarDias } from './calendario';
import {
  ACCION_AVISO_CORRIDA,
  inicioDiaRD,
  llaveDeEnvio,
  sinRepetidos,
  type ContextoColegio,
  type DestinatarioCorrida,
} from './corrida-avisos';

/** Un colegio con cuotas que se emiten en alguna de las fechas que se miran. */
export interface CorridaCandidata {
  teamId: number;
  periodoId: number;
  nombre: string;
  facturarDesde: string | null;
  /** Cuáles de las fechas pedidas tienen cuotas en este colegio. */
  fechas: string[];
}

/**
 * Los colegios que tienen algo que contar en alguna de estas fechas.
 *
 * Una sola consulta para todos: con ella la mayoría de los días no pasa de
 * aquí, porque casi ningún colegio emite exactamente dentro de 5 días, dentro
 * de 2 o hoy. Solo se mira el período activo (el índice parcial de la 0105
 * garantiza uno por colegio), igual que el cron de devengo.
 */
export async function descubrirCorridas(fechas: string[]): Promise<CorridaCandidata[]> {
  const filas = await db
    .selectDistinct({
      teamId: adminEscolarConceptoCuotas.teamId,
      periodoId: adminEscolarConceptoCuotas.periodoId,
      fecha: adminEscolarConceptoCuotas.fechaEmision,
      nombre: teams.name,
      facturarDesde: teams.escolarFacturacionAutomaticaDesde,
    })
    .from(adminEscolarConceptoCuotas)
    .innerJoin(adminEscolarPeriodos, and(
      eq(adminEscolarPeriodos.id, adminEscolarConceptoCuotas.periodoId),
      eq(adminEscolarPeriodos.activo, true),
    ))
    .innerJoin(teams, eq(teams.id, adminEscolarConceptoCuotas.teamId))
    .where(and(
      eq(adminEscolarConceptoCuotas.activo, true),
      inArray(adminEscolarConceptoCuotas.fechaEmision, fechas),
    ));

  const porColegio = new Map<number, CorridaCandidata>();
  for (const f of filas) {
    const c = porColegio.get(f.teamId) ?? {
      teamId: f.teamId,
      periodoId: f.periodoId,
      nombre: f.nombre,
      facturarDesde: f.facturarDesde ? String(f.facturarDesde) : null,
      fechas: [],
    };
    const fecha = String(f.fecha);
    if (!c.fechas.includes(fecha)) c.fechas.push(fecha);
    porColegio.set(f.teamId, c);
  }
  return [...porColegio.values()];
}

/**
 * Todo lo que el simulacro de un colegio necesita, en cinco consultas.
 *
 * Los cargos se piden solo de los conceptos que tienen cuota en las fechas que
 * se miran: son los únicos que pueden estar en la corrida, y los únicos cuyo
 * historial sirve para comparar contra la cuota anterior.
 */
export async function cargarContextoColegio(c: CorridaCandidata): Promise<ContextoColegio> {
  const { teamId, periodoId } = c;

  const [conceptos, cuotas, matriculas, precios] = await Promise.all([
    db.select({
        id: adminEscolarConceptosPago.id,
        nombre: adminEscolarConceptosPago.nombre,
        tipo: adminEscolarConceptosPago.tipo,
        admiteBeca: adminEscolarConceptosPago.admiteBeca,
        precioPorCuota: adminEscolarConceptosPago.precioPorCuota,
        productId: adminEscolarConceptosPago.productId,
        activo: adminEscolarConceptosPago.activo,
      })
      .from(adminEscolarConceptosPago)
      .where(eq(adminEscolarConceptosPago.teamId, teamId)),

    db.select({
        id: adminEscolarConceptoCuotas.id,
        conceptoId: adminEscolarConceptoCuotas.conceptoId,
        numero: adminEscolarConceptoCuotas.numero,
        mes: adminEscolarConceptoCuotas.mes,
        fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
        porcentajeMilesimas: adminEscolarConceptoCuotas.porcentajeMilesimas,
      })
      .from(adminEscolarConceptoCuotas)
      .where(and(
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        eq(adminEscolarConceptoCuotas.periodoId, periodoId),
        eq(adminEscolarConceptoCuotas.activo, true),
      )),

    // Todas las matrículas del año, no solo las activas: un cargo que ya existe
    // se factura aunque el alumno se haya retirado, y para facturarlo hace falta
    // saber quién paga y en qué grado está.
    db.select({
        id: adminEscolarMatriculas.id,
        estudianteId: adminEscolarMatriculas.estudianteId,
        cursoId: adminEscolarMatriculas.cursoId,
        gradoId: adminEscolarCursos.gradoId,
        servicioId: adminEscolarGrados.servicioId,
        estado: adminEscolarMatriculas.estado,
        fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
        becaTipo: adminEscolarMatriculas.becaTipo,
        becaValor: adminEscolarMatriculas.becaValor,
        conceptosIds: adminEscolarMatriculas.conceptosIds,
        conceptoMensualidadId: adminEscolarMatriculas.conceptoMensualidadId,
        planEstado: facturasRecurrentes.estado,
        clienteId: adminEscolarEstudiantes.facturarAClientId,
      })
      .from(adminEscolarMatriculas)
      .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
      .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarMatriculas.estudianteId))
      // El plan, para saber si sigue activo: la facturación automática solo le
      // cede la colegiatura a planes que corren (`facturarCuotasEmitidas`).
      .leftJoin(facturasRecurrentes, and(
        eq(facturasRecurrentes.id, adminEscolarMatriculas.facturaRecurrenteId),
        eq(facturasRecurrentes.teamId, teamId),
      ))
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.periodoId, periodoId),
      )),

    db.select({
        conceptoId: adminEscolarConceptoPrecios.conceptoId,
        objetivoTipo: adminEscolarConceptoPrecios.objetivoTipo,
        objetivoId: adminEscolarConceptoPrecios.objetivoId,
        montoCentavos: adminEscolarConceptoPrecios.montoCentavos,
        productId: adminEscolarConceptoPrecios.productId,
        cuotas: adminEscolarConceptoPrecios.cuotas,
      })
      .from(adminEscolarConceptoPrecios)
      .where(and(
        eq(adminEscolarConceptoPrecios.teamId, teamId),
        eq(adminEscolarConceptoPrecios.periodoId, periodoId),
        eq(adminEscolarConceptoPrecios.activo, true),
      )),
  ]);

  const enJuego = [...new Set(
    cuotas.filter((q) => c.fechas.includes(String(q.fechaEmision))).map((q) => q.conceptoId),
  )];

  const cargos = enJuego.length === 0 ? [] : await db
    .select({
      id: adminEscolarCargos.id,
      matriculaId: adminEscolarCargos.matriculaId,
      conceptoId: adminEscolarCargos.conceptoId,
      cuotaId: adminEscolarCargos.cuotaId,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      cuotaFechaEmision: adminEscolarConceptoCuotas.fechaEmision,
      cuotaPorcentajeMilesimas: adminEscolarConceptoCuotas.porcentajeMilesimas,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptoCuotas, eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.periodoId, periodoId),
      inArray(adminEscolarCargos.conceptoId, enJuego),
    ));

  return {
    teamId,
    periodoId,
    conceptos,
    cuotas: cuotas.map((q) => ({ ...q, fechaEmision: String(q.fechaEmision) })),
    matriculas: matriculas.map(({ planEstado, ...m }) => ({
      ...m,
      fechaInscripcion: m.fechaInscripcion ? String(m.fechaInscripcion) : null,
      conceptosIds: m.conceptosIds ?? [],
      conPlanActivo: planEstado === 'activa',
    })),
    precios,
    cargos: cargos.map((g) => ({
      ...g,
      cuotaFechaEmision: g.cuotaFechaEmision ? String(g.cuotaFechaEmision) : null,
    })),
  };
}

/**
 * De estas facturas, cuáles se crearon en el día `fecha` (hora RD) y siguen
 * vivas. Es lo que separa «la facturó la corrida de hoy» de «ya venía facturada».
 */
export async function facturasCreadasEl(
  teamId: number,
  documentoIds: number[],
  fecha: string,
): Promise<Set<number>> {
  if (documentoIds.length === 0) return new Set();
  const filas = await db
    .select({ id: ecfDocuments.id })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      inArray(ecfDocuments.id, [...new Set(documentoIds)]),
      gte(ecfDocuments.createdAt, inicioDiaRD(fecha)),
      lt(ecfDocuments.createdAt, inicioDiaRD(sumarDias(fecha, 1))),
      ne(ecfDocuments.estado, 'ANULADO'),
    ));
  return new Set(filas.map((f) => f.id));
}

/**
 * Quién administra cada colegio: los `owner` y `admin`, sin repetir correos y
 * sin usuarios dados de baja. Una consulta para todos los colegios del día.
 */
export async function destinatariosPorColegio(
  teamIds: number[],
): Promise<Map<number, DestinatarioCorrida[]>> {
  const porColegio = new Map<number, DestinatarioCorrida[]>();
  if (teamIds.length === 0) return porColegio;

  const filas = await db
    .select({
      teamId: teamMembers.teamId,
      userId: users.id,
      email: users.email,
      rol: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(
      inArray(teamMembers.teamId, teamIds),
      inArray(teamMembers.role, ['owner', 'admin']),
      isNull(users.deletedAt),
    ))
    // El dueño primero: si hay dos filas para el mismo correo, se queda la suya.
    .orderBy(teamMembers.joinedAt);

  for (const f of filas) {
    const lista = porColegio.get(f.teamId) ?? [];
    lista.push({ userId: f.userId, email: f.email });
    porColegio.set(f.teamId, lista);
  }
  for (const [teamId, lista] of porColegio) porColegio.set(teamId, sinRepetidos(lista));
  return porColegio;
}

/**
 * Los avisos que ya salieron, como llaves de `llaveDeEnvio`.
 * Una consulta para todos los colegios y las tres claves del día.
 */
export async function avisosYaEnviados(teamIds: number[], claves: string[]): Promise<Set<string>> {
  if (teamIds.length === 0 || claves.length === 0) return new Set();
  const filas = await db
    .select({ teamId: auditLogs.teamId, userId: auditLogs.userId, resource: auditLogs.resource })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, ACCION_AVISO_CORRIDA),
      inArray(auditLogs.teamId, teamIds),
      inArray(auditLogs.resource, claves),
    ));
  return new Set(filas
    .filter((f) => f.teamId != null && f.resource != null)
    .map((f) => llaveDeEnvio(f.teamId!, f.resource!, f.userId)));
}

/**
 * Anota que el aviso le salió a esta persona. Va DESPUÉS de enviar, nunca antes:
 * al revés, un fallo de Resend dejaría la marca puesta y el colegio no se
 * enteraría nunca.
 */
export async function registrarEnvio(r: {
  teamId: number;
  userId: number;
  clave: string;
  meta: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogs).values({
    teamId: r.teamId,
    userId: r.userId,
    actor: 'system',
    action: ACCION_AVISO_CORRIDA,
    resource: r.clave,
    metadata: JSON.stringify(r.meta),
  });
}
