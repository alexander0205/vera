/**
 * Dar de baja a un alumno y volver a darlo de alta.
 *
 * Los alumnos se van del colegio y, a veces, vuelven meses después. El estado
 * de la ficha (activo / retirado / ...) ya existía, pero cambiarlo era solo una
 * etiqueta: la matrícula seguía activa, el devengo le seguía creando cuotas y
 * la mensualidad automática le seguía emitiendo facturas a la familia de un
 * niño que ya no estaba.
 *
 * Y volver era peor. Reactivar la matrícula tal cual hacía que:
 *   · el devengo, que arma el plan desde la fecha de inscripción, creara las
 *     cuotas de TODOS los meses en que estuvo fuera;
 *   · la recurrente, que busca el primer período sin factura desde su fecha de
 *     inicio, emitiera una factura por cada uno de esos meses, una por día.
 *
 * Por eso el reingreso mueve las dos fechas de arranque —la inscripción de la
 * matrícula y el inicio de la recurrente— al día en que vuelve, y deja escrito
 * en las notas de la matrícula cuáles eran. Lo ya cobrado antes de irse no se
 * toca: esos cargos y esas facturas siguen donde estaban.
 *
 * Cada baja y cada reingreso deja una fila en
 * `admin_escolar_estudiante_movimientos` (migración 0197): quién, cuándo, por
 * qué, qué cuotas anuló o devolvió y qué fechas sobrescribió. Las cuotas de
 * meses futuros que la baja anula se leen de ahí al volver, y el reingreso
 * devuelve las que caen del mes en que vuelve en adelante. Las de los meses
 * fuera siguen anuladas. Las notas de la matrícula llevan además una línea
 * legible, pero ya no son la fuente de nada.
 */

import 'server-only';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarEstudianteMovimientos,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  facturasRecurrentes,
  users,
} from '@/lib/db/schema';
import { siguientePeriodo } from '@/lib/cobranza/recurrente';

/** A qué estado puede pasar un alumno que se da de baja. */
export const ESTADOS_DE_BAJA = ['retirado', 'inactivo', 'graduado'] as const;
export type EstadoDeBaja = (typeof ESTADOS_DE_BAJA)[number];

/**
 * Qué le pasa a su matrícula. El que se gradúa terminó el año: su matrícula
 * queda «finalizada», no «retirada», que es lo que se lee en el historial.
 */
export function estadoMatriculaDeBaja(estado: EstadoDeBaja): 'retirada' | 'finalizada' {
  return estado === 'graduado' ? 'finalizada' : 'retirada';
}

/**
 * La primera fecha del calendario de la recurrente que cae en `desde` o
 * después. Recorre con la misma regla con la que se emite (`siguientePeriodo`)
 * para que la fecha nueva sea una de las que el motor de verdad usaría.
 */
export function alinearAlCalendario(
  fechaInicio: string,
  frecuencia: string,
  diaCobro: number | null,
  desde: string,
): string {
  let cursor = fechaInicio;
  for (let i = 0; i < 600 && cursor < desde; i++) {
    const sig = siguientePeriodo(cursor, frecuencia, diaCobro);
    if (sig <= cursor) break;   // una frecuencia que no avanza no cuelga el bucle
    cursor = sig;
  }
  return cursor;
}

/**
 * ¿Es una fecha de calendario real en formato YYYY-MM-DD?
 *
 * El patrón solo no basta: «2026-13-45» lo cumple, llega a Postgres como fecha
 * y la consulta revienta con un 500 en vez de un mensaje.
 */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Otro usuario —u otra pestaña— cambió al alumno mientras se confirmaba. */
/**
 * Las matrículas que una baja cierra: las de años que no han terminado a la
 * fecha de la baja (o sin fecha de fin). Las de años pasados que quedaron
 * «activa» —las importaciones de SIGERD las crean así— no se tocan: cerrarlas
 * cambiaba los números de esos años, y el reingreso, que solo reabre la del año
 * activo, no las devolvía.
 */
function deAnoVigente(fecha: string) {
  return sql`(${adminEscolarPeriodos.id} IS NULL OR ${adminEscolarPeriodos.activo} = true
    OR ${adminEscolarPeriodos.fechaFin} IS NULL OR ${adminEscolarPeriodos.fechaFin} >= ${fecha})`;
}

/** Una segunda baja sin nada que cerrar: no se registra otra vez. */
export class YaDeBajaError extends Error {
  constructor() {
    super('Este alumno ya está dado de baja y no le queda matrícula ni mensualidad que cerrar.');
    this.name = 'YaDeBajaError';
  }
}

export class AlumnoCambiadoError extends Error {
  constructor() {
    super('Alguien acaba de cambiar a este alumno. Cierra el diálogo y vuelve a abrirlo.');
    this.name = 'AlumnoCambiadoError';
  }
}

/** La fecha de vuelta no puede ser anterior a la baja. */
export class FechaReingresoError extends Error {
  constructor(public fechaBaja: string) {
    super(`La fecha en que vuelve no puede ser anterior a la baja (${fechaBaja}).`);
    this.name = 'FechaReingresoError';
  }
}

/**
 * Un alumno a la vez. Dos clics seguidos —o dos pestañas— calculaban la vista
 * previa los dos antes de que ninguno escribiera, y la baja quedaba dos veces en
 * el historial. Llave propia (`hashtext`) para no compartir espacio con el
 * candado de dos enteros del devengo.
 */
async function bloquearAlumno(tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, teamId: number, estudianteId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`baja-reingreso:${teamId}:${estudianteId}`}))`);
}

/** Añade una línea fechada a las notas, sin pisar lo que ya había. */
export function anotar(notas: string | null, fecha: string, texto: string): string {
  const linea = `[${fecha}] ${texto}`;
  return notas?.trim() ? `${notas.trim()}\n${linea}` : linea;
}

/**
 * Los cargos que se pueden anular al darle de baja: los de meses POSTERIORES
 * al de la baja, sin factura y sin un peso cobrado.
 *
 * El mes en que se va se queda: lo normal es que lo haya cursado. Lo que tiene
 * factura tampoco se toca —esa deuda vive en la factura y se anula allí—, ni
 * lo que tiene un abono, que sería borrar un pago.
 */
export function esCargoPosteriorAnulable(
  c: { mes: number | null; anio: number; ecfDocumentId: number | null; montoCentavos: number; saldoCentavos: number; estado: string },
  fechaBaja: string,
): boolean {
  if (c.estado === 'anulado' || c.ecfDocumentId != null || c.mes == null) return false;
  if (c.saldoCentavos < c.montoCentavos) return false;
  const [y, m] = fechaBaja.split('-').map(Number);
  return c.anio * 12 + c.mes > y * 12 + m;
}

/** ¿El cargo es del mes del reingreso o posterior? Esos se vuelven a cobrar. */
export function esDelReingresoEnAdelante(c: { mes: number | null; anio: number }, fecha: string): boolean {
  if (c.mes == null) return false;
  const [y, m] = fecha.split('-').map(Number);
  return c.anio * 12 + c.mes >= y * 12 + m;
}

export interface PreviaBaja {
  matriculas: { id: number; periodo: string | null; curso: string | null; facturaRecurrenteId: number | null }[];
  recurrentes: { id: number; nombre: string; estado: string }[];
  /** Cargos de meses posteriores que se pueden anular. */
  cargosPosteriores: { id: number; matriculaId: number | null; concepto: string | null; mes: number; anio: number; montoCentavos: number }[];
  /** Lo que ya debe y no se toca: cargos con factura o de meses ya cursados. */
  deudaQueSeQuedaCentavos: number;
}

export async function previaBaja(teamId: number, estudianteId: number, fecha: string): Promise<PreviaBaja> {
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      periodo: adminEscolarPeriodos.nombre,
      curso: adminEscolarCursos.nombre,
      facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
    .leftJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, estudianteId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      deAnoVigente(fecha),
    ));

  /**
   * Las mensualidades a pausar salen de TODAS sus matrículas, no solo de las
   * activas. Un alumno dado de baja con el camino viejo podía tener la matrícula
   * ya retirada y la mensualidad todavía emitiendo: «Terminar la baja» no la
   * encontraba, no la pausaba, y el aviso rojo no se iba nunca.
   */
  const todas = await db
    .select({ facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, estudianteId),
    ));
  const idsRecurrentes = [...new Set(todas.map((m) => m.facturaRecurrenteId).filter((x): x is number => x != null))];
  const [recurrentes, compartidas, cargos] = await Promise.all([
    idsRecurrentes.length === 0 ? Promise.resolve([]) : db
      .select({ id: facturasRecurrentes.id, nombre: facturasRecurrentes.nombre, estado: facturasRecurrentes.estado })
      .from(facturasRecurrentes)
      .where(and(eq(facturasRecurrentes.teamId, teamId), inArray(facturasRecurrentes.id, idsRecurrentes))),
    /**
     * Una recurrente que también factura la matrícula de OTRO alumno no se
     * pausa: pararla dejaría de cobrarle al hermano que sigue en el colegio.
     */
    idsRecurrentes.length === 0 ? Promise.resolve([]) : db
      .select({ id: adminEscolarMatriculas.facturaRecurrenteId })
      .from(adminEscolarMatriculas)
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.estado, 'activa'),
        ne(adminEscolarMatriculas.estudianteId, estudianteId),
        inArray(adminEscolarMatriculas.facturaRecurrenteId, idsRecurrentes),
      )),
    db
      .select({
        id: adminEscolarCargos.id,
        matriculaId: adminEscolarCargos.matriculaId,
        concepto: adminEscolarConceptosPago.nombre,
        mes: adminEscolarCargos.mes,
        anio: adminEscolarCargos.anio,
        montoCentavos: adminEscolarCargos.montoCentavos,
        saldoCentavos: adminEscolarCargos.saldoCentavos,
        ecfDocumentId: adminEscolarCargos.ecfDocumentId,
        estado: adminEscolarCargos.estado,
      })
      .from(adminEscolarCargos)
      .leftJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.estudianteId, estudianteId),
        ne(adminEscolarCargos.estado, 'anulado'),
      )),
  ]);

  // Solo las de la matrícula que se cierra: quedan apuntadas en ella y se
  // pueden devolver si vuelve.
  const deLasMatriculas = new Set(matriculas.map((m) => m.id));
  const posteriores = cargos.filter((c) =>
    c.matriculaId != null && deLasMatriculas.has(c.matriculaId) && esCargoPosteriorAnulable(c, fecha));
  const idsPosteriores = new Set(posteriores.map((c) => c.id));
  const deOtros = new Set(compartidas.map((c) => c.id));

  return {
    matriculas,
    recurrentes: recurrentes.filter((r) => r.estado === 'activa' && !deOtros.has(r.id)),
    cargosPosteriores: posteriores
      .map((c) => ({ id: c.id, matriculaId: c.matriculaId, concepto: c.concepto, mes: c.mes as number, anio: c.anio, montoCentavos: c.montoCentavos }))
      .sort((a, b) => a.anio - b.anio || a.mes - b.mes),
    deudaQueSeQuedaCentavos: cargos
      .filter((c) => !idsPosteriores.has(c.id))
      .reduce((s, c) => s + Math.max(0, c.saldoCentavos), 0),
  };
}

export async function darDeBaja(teamId: number, estudianteId: number, opts: {
  estado: EstadoDeBaja; fecha: string; motivo: string | null; anularPosteriores: boolean;
  /** Quién la registra. */
  userId: number | null;
}) {
  const previa = await previaBaja(teamId, estudianteId, opts.fecha);
  const [antes] = await db.select({ estado: adminEscolarEstudiantes.estado })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  // Ya de baja y sin nada abierto: otra fila de historial solo movería la fecha
  // de la última baja y haría fallar un reingreso legítimo anterior a ella.
  const quedanCuotas = opts.anularPosteriores && previa.cargosPosteriores.length > 0;
  if (antes?.estado !== 'activo' && previa.matriculas.length === 0 && previa.recurrentes.length === 0 && !quedanCuotas) {
    throw new YaDeBajaError();
  }
  const etiqueta = { retirado: 'Retirado', inactivo: 'Inactivo', graduado: 'Graduado' }[opts.estado];
  const texto = `Baja: ${etiqueta}${opts.motivo ? ` — ${opts.motivo}` : ''}.`;

  let anuladasTotal = 0;
  await db.transaction(async (tx) => {
    await bloquearAlumno(tx, teamId, estudianteId);
    // Lo que se enseñó en la vista previa tiene que seguir siendo verdad.
    const [ahora] = await tx.select({ estado: adminEscolarEstudiantes.estado })
      .from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
      .limit(1);
    const activasAhora = await tx.select({ id: adminEscolarMatriculas.id })
      .from(adminEscolarMatriculas)
      .leftJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.estudianteId, estudianteId),
        eq(adminEscolarMatriculas.estado, 'activa'),
        deAnoVigente(opts.fecha),
      ));
    const mismas = activasAhora.length === previa.matriculas.length
      && activasAhora.every((a) => previa.matriculas.some((m) => m.id === a.id));
    if (ahora?.estado !== antes?.estado || !mismas) throw new AlumnoCambiadoError();

    await tx.update(adminEscolarEstudiantes)
      .set({ estado: opts.estado, updatedAt: new Date() })
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)));

    for (const m of previa.matriculas) {
      const [actual] = await tx.select({ notas: adminEscolarMatriculas.notas })
        .from(adminEscolarMatriculas).where(eq(adminEscolarMatriculas.id, m.id)).limit(1);
      const suyas = opts.anularPosteriores
        ? previa.cargosPosteriores.filter((c) => c.matriculaId === m.id).length
        : 0;
      const linea = suyas > 0 ? `${texto} ${suyas} cuota(s) futura(s) anulada(s).` : texto;
      await tx.update(adminEscolarMatriculas)
        .set({ estado: estadoMatriculaDeBaja(opts.estado), notas: anotar(actual?.notas ?? null, opts.fecha, linea), updatedAt: new Date() })
        .where(and(eq(adminEscolarMatriculas.id, m.id), eq(adminEscolarMatriculas.teamId, teamId)));
    }

    // Pausada y no finalizada: si vuelve, se reanuda la misma, con su historial.
    if (previa.recurrentes.length > 0) {
      await tx.update(facturasRecurrentes)
        .set({ estado: 'pausada', updatedAt: new Date() })
        .where(and(
          eq(facturasRecurrentes.teamId, teamId),
          inArray(facturasRecurrentes.id, previa.recurrentes.map((r) => r.id)),
        ));
    }

    /**
     * Las cuotas futuras, anuladas con la condición vuelta a mirar dentro del
     * bloqueo: entre la vista previa y aquí el cron pudo facturar una o alguien
     * abonarla, y esas ya no se tocan. Solo lo que de verdad se anuló queda en
     * la constancia, que es lo que el reingreso devuelve.
     */
    const anuladas = new Set<number>();
    if (opts.anularPosteriores && previa.cargosPosteriores.length > 0) {
      const filas = await tx.update(adminEscolarCargos)
        .set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })
        .where(and(
          eq(adminEscolarCargos.teamId, teamId),
          inArray(adminEscolarCargos.id, previa.cargosPosteriores.map((c) => c.id)),
          isNull(adminEscolarCargos.ecfDocumentId),
          ne(adminEscolarCargos.estado, 'anulado'),
          sql`${adminEscolarCargos.saldoCentavos} = ${adminEscolarCargos.montoCentavos}`,
        ))
        .returning({ id: adminEscolarCargos.id });
      for (const f of filas) anuladas.add(f.id);
    }
    anuladasTotal = anuladas.size;

    /**
     * La constancia: una fila por matrícula cerrada —o una sola si no tenía—,
     * con las cuotas que se le anularon. Es lo que lee el reingreso.
     */
    const pausadas = new Set(previa.recurrentes.map((r) => r.id));
    const cerradas = previa.matriculas.length > 0 ? previa.matriculas : [null];
    await tx.insert(adminEscolarEstudianteMovimientos).values(cerradas.map((m) => ({
      teamId,
      estudianteId,
      matriculaId: m?.id ?? null,
      tipo: 'baja',
      estadoAnterior: antes?.estado ?? null,
      estadoNuevo: opts.estado,
      fecha: opts.fecha,
      motivo: opts.motivo,
      cuotasAnuladas: m
        ? previa.cargosPosteriores.filter((c) => c.matriculaId === m.id && anuladas.has(c.id)).map((c) => c.id)
        : [],
      recurrenteId: m
        ? (m.facturaRecurrenteId != null && pausadas.has(m.facturaRecurrenteId) ? m.facturaRecurrenteId : null)
        : (previa.recurrentes[0]?.id ?? null),
      userId: opts.userId,
    })));
  });

  return {
    matriculas: previa.matriculas.length,
    recurrentesPausadas: previa.recurrentes.length,
    cargosAnulados: anuladasTotal,
  };
}

export interface PreviaReingreso {
  /** La matrícula del año en curso que se puede reabrir, si la hay. */
  matricula: { id: number; periodo: string | null; curso: string | null; estado: string; fechaInscripcion: string | null } | null;
  recurrente: { id: number; nombre: string; estado: string; proximaActual: string; proximaNueva: string | null } | null;
  /** Las cuotas que anuló la baja y caen del mes del reingreso en adelante. */
  cuotasARestaurar: { id: number; concepto: string | null; mes: number; anio: number; montoCentavos: number }[];
  /** El día de su última baja: no puede volver antes de haberse ido. */
  fechaUltimaBaja: string | null;
}

/**
 * Qué se puede reabrir. Solo la matrícula del año escolar en curso: la de un
 * año que ya pasó no tiene a dónde volver, y lo que toca es matricularlo de
 * nuevo en el actual.
 */
export async function previaReingreso(teamId: number, estudianteId: number, fecha: string): Promise<PreviaReingreso> {
  const [ultimaBaja] = await db
    .select({ fecha: adminEscolarEstudianteMovimientos.fecha })
    .from(adminEscolarEstudianteMovimientos)
    .where(and(
      eq(adminEscolarEstudianteMovimientos.teamId, teamId),
      eq(adminEscolarEstudianteMovimientos.estudianteId, estudianteId),
      eq(adminEscolarEstudianteMovimientos.tipo, 'baja'),
    ))
    .orderBy(desc(adminEscolarEstudianteMovimientos.id))
    .limit(1);
  const fechaUltimaBaja = ultimaBaja?.fecha ? String(ultimaBaja.fecha) : null;

  const [m] = await db
    .select({
      id: adminEscolarMatriculas.id,
      periodo: adminEscolarPeriodos.nombre,
      curso: adminEscolarCursos.nombre,
      estado: adminEscolarMatriculas.estado,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
    .leftJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, estudianteId),
      eq(adminEscolarPeriodos.activo, true),
      inArray(adminEscolarMatriculas.estado, ['retirada', 'activa']),
    ))
    .orderBy(desc(adminEscolarMatriculas.id))
    .limit(1);

  if (!m) return { matricula: null, recurrente: null, cuotasARestaurar: [], fechaUltimaBaja };

  /**
   * Lo que anuló la ÚLTIMA baja de esta matrícula. Si lo último que pasó fue un
   * reingreso, no hay nada que devolver: ya se devolvió.
   *
   * Los meses que estuvo fuera siguen anulados; los que le quedan vuelven.
   */
  const [ultimo] = await db
    .select({ tipo: adminEscolarEstudianteMovimientos.tipo, cuotas: adminEscolarEstudianteMovimientos.cuotasAnuladas })
    .from(adminEscolarEstudianteMovimientos)
    .where(and(
      eq(adminEscolarEstudianteMovimientos.teamId, teamId),
      eq(adminEscolarEstudianteMovimientos.estudianteId, estudianteId),
      eq(adminEscolarEstudianteMovimientos.matriculaId, m.id),
    ))
    .orderBy(desc(adminEscolarEstudianteMovimientos.id))
    .limit(1);
  const anuladas = ultimo?.tipo === 'baja' ? (ultimo.cuotas ?? []) : [];
  const candidatas = anuladas.length === 0 ? [] : await db
    .select({
      id: adminEscolarCargos.id,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.matriculaId, m.id),
      eq(adminEscolarCargos.estado, 'anulado'),
      isNull(adminEscolarCargos.ecfDocumentId),
      inArray(adminEscolarCargos.id, anuladas),
    ));
  const cuotasARestaurar = candidatas
    .filter((c) => esDelReingresoEnAdelante(c, fecha))
    .map((c) => ({ ...c, mes: c.mes as number }))
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes);

  let recurrente: PreviaReingreso['recurrente'] = null;
  if (m.facturaRecurrenteId) {
    const [fr] = await db.select().from(facturasRecurrentes)
      .where(and(eq(facturasRecurrentes.id, m.facturaRecurrenteId), eq(facturasRecurrentes.teamId, teamId)))
      .limit(1);
    if (fr && fr.estado !== 'finalizada') {
      const nueva = alinearAlCalendario(String(fr.fechaInicio), fr.frecuencia, fr.diaCobro, fecha);
      recurrente = {
        id: fr.id, nombre: fr.nombre, estado: fr.estado,
        proximaActual: String(fr.proximaEmision),
        // Pasado el fin del plan ya no queda nada que emitir.
        proximaNueva: fr.fechaFin && nueva > String(fr.fechaFin) ? null : nueva,
      };
    }
  }

  return {
    matricula: {
      id: m.id, periodo: m.periodo, curso: m.curso, estado: m.estado,
      fechaInscripcion: m.fechaInscripcion ? String(m.fechaInscripcion) : null,
    },
    recurrente,
    cuotasARestaurar: m.estado === 'retirada' ? cuotasARestaurar : [],
    fechaUltimaBaja,
  };
}

export async function reingresar(teamId: number, estudianteId: number, opts: {
  fecha: string; reabrirMatricula: boolean;
  /** Quién lo registra. */
  userId: number | null;
}) {
  const previa = await previaReingreso(teamId, estudianteId, opts.fecha);
  if (previa.fechaUltimaBaja && opts.fecha < previa.fechaUltimaBaja) {
    throw new FechaReingresoError(previa.fechaUltimaBaja);
  }
  const [antes] = await db.select({ estado: adminEscolarEstudiantes.estado })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  const m = previa.matricula;
  const reabre = opts.reabrirMatricula && m?.estado === 'retirada';
  const r = reabre ? previa.recurrente : null;

  await db.transaction(async (tx) => {
    await bloquearAlumno(tx, teamId, estudianteId);
    const [ahora] = await tx.select({ estado: adminEscolarEstudiantes.estado })
      .from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
      .limit(1);
    if (ahora?.estado !== antes?.estado || ahora?.estado === 'activo') throw new AlumnoCambiadoError();

    const [fr] = r
      ? await tx.select({ notas: facturasRecurrentes.notas, fechaInicio: facturasRecurrentes.fechaInicio })
        .from(facturasRecurrentes).where(eq(facturasRecurrentes.id, r.id)).limit(1)
      : [];

    await tx.insert(adminEscolarEstudianteMovimientos).values({
      teamId,
      estudianteId,
      matriculaId: reabre && m ? m.id : null,
      tipo: 'reingreso',
      estadoAnterior: antes?.estado ?? null,
      estadoNuevo: 'activo',
      fecha: opts.fecha,
      cuotasRestauradas: reabre ? previa.cuotasARestaurar.map((c) => c.id) : [],
      fechaInscripcionAnterior: reabre && m ? m.fechaInscripcion : null,
      recurrenteId: r?.id ?? null,
      recurrenteInicioAnterior: fr?.fechaInicio ? String(fr.fechaInicio) : null,
      recurrenteInicioNuevo: r?.proximaNueva ?? null,
      userId: opts.userId,
    });

    await tx.update(adminEscolarEstudiantes)
      .set({ estado: 'activo', updatedAt: new Date() })
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)));

    if (!reabre || !m) return;

    const [actual] = await tx.select({ notas: adminEscolarMatriculas.notas })
      .from(adminEscolarMatriculas).where(eq(adminEscolarMatriculas.id, m.id)).limit(1);
    const inscripcionAntes = m.fechaInscripcion ? `la inscripción era del ${m.fechaInscripcion}` : 'no tenía fecha de inscripción';
    await tx.update(adminEscolarMatriculas)
      .set({
        estado: 'activa',
        // El devengo arma el plan desde aquí: lo de antes del reingreso no se
        // vuelve a generar, y lo que se cobró antes de irse ya existe. Nunca
        // hacia atrás: con una fecha anterior a la inscripción original el
        // devengo cobraría meses de antes de que el alumno entrara.
        fechaInscripcion: m.fechaInscripcion && m.fechaInscripcion > opts.fecha ? m.fechaInscripcion : opts.fecha,
        notas: anotar(actual?.notas ?? null, opts.fecha, `Reingreso (${inscripcionAntes}; se movió al reingreso para no cobrar los meses fuera).`),
        updatedAt: new Date(),
      })
      .where(and(eq(adminEscolarMatriculas.id, m.id), eq(adminEscolarMatriculas.teamId, teamId)));

    if (previa.cuotasARestaurar.length > 0) {
      await tx.update(adminEscolarCargos)
        .set({ estado: 'pendiente', saldoCentavos: sql`${adminEscolarCargos.montoCentavos}`, updatedAt: new Date() })
        .where(and(
          eq(adminEscolarCargos.teamId, teamId),
          eq(adminEscolarCargos.estado, 'anulado'),
          inArray(adminEscolarCargos.id, previa.cuotasARestaurar.map((c) => c.id)),
        ));
    }

    if (r) {
      await tx.update(facturasRecurrentes)
        .set(r.proximaNueva
          // El inicio se mueve también: la recurrente busca el primer período
          // sin factura DESDE su inicio, y los meses fuera no tienen ninguna.
          ? {
              estado: 'activa', fechaInicio: r.proximaNueva, proximaEmision: r.proximaNueva,
              notas: anotar(fr?.notas ?? null, opts.fecha, `Reingreso del alumno: el inicio pasó de ${fr?.fechaInicio} a ${r.proximaNueva}.`),
              updatedAt: new Date(),
            }
          : { estado: 'finalizada', updatedAt: new Date() })
        .where(and(eq(facturasRecurrentes.id, r.id), eq(facturasRecurrentes.teamId, teamId)));
    }
  });

  return {
    matriculaReabierta: reabre,
    cuotasRestauradas: reabre ? previa.cuotasARestaurar.length : 0,
    recurrente: previa.recurrente,
  };
}

/** Las bajas y reingresos de un alumno, el último primero, con quién lo hizo. */
export async function movimientosDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: adminEscolarEstudianteMovimientos.id,
      tipo: adminEscolarEstudianteMovimientos.tipo,
      estadoAnterior: adminEscolarEstudianteMovimientos.estadoAnterior,
      estadoNuevo: adminEscolarEstudianteMovimientos.estadoNuevo,
      fecha: adminEscolarEstudianteMovimientos.fecha,
      motivo: adminEscolarEstudianteMovimientos.motivo,
      cuotasAnuladas: adminEscolarEstudianteMovimientos.cuotasAnuladas,
      cuotasRestauradas: adminEscolarEstudianteMovimientos.cuotasRestauradas,
      fechaInscripcionAnterior: adminEscolarEstudianteMovimientos.fechaInscripcionAnterior,
      recurrenteInicioAnterior: adminEscolarEstudianteMovimientos.recurrenteInicioAnterior,
      recurrenteInicioNuevo: adminEscolarEstudianteMovimientos.recurrenteInicioNuevo,
      periodo: adminEscolarPeriodos.nombre,
      usuario: users.name,
      usuarioEmail: users.email,
      creadoEn: adminEscolarEstudianteMovimientos.creadoEn,
    })
    .from(adminEscolarEstudianteMovimientos)
    .leftJoin(adminEscolarMatriculas, eq(adminEscolarMatriculas.id, adminEscolarEstudianteMovimientos.matriculaId))
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
    .leftJoin(users, eq(users.id, adminEscolarEstudianteMovimientos.userId))
    .where(and(
      eq(adminEscolarEstudianteMovimientos.teamId, teamId),
      eq(adminEscolarEstudianteMovimientos.estudianteId, estudianteId),
    ))
    .orderBy(desc(adminEscolarEstudianteMovimientos.id))
    .limit(100);
}
