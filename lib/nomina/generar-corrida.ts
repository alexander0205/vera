/**
 * generar-corrida.ts — crea una corrida de nómina en la base.
 *
 * Extraído del POST /api/nomina/corridas para que lo compartan la creación
 * manual (botón "Nueva corrida") y el cron de programación automática. Aquí sí
 * hay BD; la aritmética sigue en `construirCorrida` (pura). Siempre nace en
 * BORRADOR: no aprueba ni paga.
 *
 * No deja dos corridas de la misma frecuencia sobre las mismas fechas: primero
 * busca un solape y, si dos peticiones llegan a la vez, el índice único
 * (team, tipo, fecha_inicio) detiene a la segunda. En los dos casos devuelve
 * `motivo: 'ya-existe'` en vez de reventar.
 */
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaHoras, nominaLineaConceptos, nominaLineas } from '@/lib/db/schema';
import { clasificarHoras, finLecturaHoras, inicioLecturaHoras, type RegistroHoras, type ResumenHoras } from '@/lib/nomina/horas';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import {
  construirCorrida, esUltimoPeriodoDelMes, frecuenciaDeTipo, LABEL_TIPO_CORRIDA, periodoDeCorrida, tiposDeFrecuencia,
  type PeriodoCorrida, type PrevioMes, type TipoCorrida,
} from '@/lib/nomina/corrida';
import { toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';
import { adicionalesPorEmpleado, ajustesNomina } from '@/lib/nomina/ajustes-db';
import { leerAvanzado } from '@/lib/nomina/avanzado-db';
import { ausenciasParaCorrida } from '@/lib/nomina/ausencias-db';
import type { ConceptoAplicable } from '@/lib/nomina/conceptos';
import { conceptosParaCorrida, guardarConceptosDeLineas } from '@/lib/nomina/conceptos-db';
import { rangoDelMes, rangoLegible } from '@/lib/nomina/periodos';

export interface GenerarCorridaInput {
  teamId: number;
  tipo: TipoCorrida;
  /** Mes 'YYYY-MM' de la mensual y las quincenas. */
  periodo?: string;
  /** Primer día 'YYYY-MM-DD' de la semanal. */
  fechaInicio?: string;
  /** Vacía = «Nómina 1ra quincena · 1 al 15 de noviembre de 2026». */
  descripcion?: string;
  fechaPago?: string | null;
  userId?: number | null;
}

export interface CorridaExistente {
  id: number;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
}

export type GenerarCorridaResultado =
  | { creada: true; corridaId: number; lineas: number; totalNetoCents: number; periodo: PeriodoCorrida }
  | { creada: false; motivo: 'periodo-invalido' }
  | { creada: false; motivo: 'sin-empleados'; periodo: PeriodoCorrida }
  | { creada: false; motivo: 'ya-existe'; periodo: PeriodoCorrida; existente: CorridaExistente | null };

/** La descripción por defecto de una corrida. */
export const descripcionDeCorrida = (p: PeriodoCorrida) =>
  `Nómina ${LABEL_TIPO_CORRIDA[p.tipo].toLowerCase()} · ${rangoLegible(p)}`;

/**
 * Lo que cada empleado ya tiene APROBADO en las corridas anteriores del mismo mes (1.ª quincena, o las semanas
 * anteriores del mes), para cerrar el ISR del mes en la última corrida. Solo se lee en la última del mes.
 */
async function previoDelMes(teamId: number, empleadoIds: number[], periodo: PeriodoCorrida): Promise<Map<number, PrevioMes>> {
  const mapa = new Map<number, PrevioMes>();
  if (!esUltimoPeriodoDelMes(periodo) || empleadoIds.length === 0) return mapa;
  const previas = and(
    eq(nominaLineas.teamId, teamId),
    inArray(nominaLineas.empleadoId, empleadoIds),
    inArray(nominaCorridas.estado, ['aprobada', 'pagada']),
    eq(nominaCorridas.periodo, periodo.periodo),
    periodo.tipo === 'quincenal-2' ? eq(nominaCorridas.tipo, 'quincenal-1') : and(eq(nominaCorridas.tipo, 'semanal'), lt(nominaCorridas.fechaInicio, periodo.inicio)),
  );
  const filas = await db
    .select({
      empleadoId: nominaLineas.empleadoId,
      bruto: sql<number>`sum(${nominaLineas.brutoCents})::bigint`,
      afp: sql<number>`sum(${nominaLineas.afpEmpleadoCents})::bigint`,
      sfs: sql<number>`sum(${nominaLineas.sfsEmpleadoCents})::bigint`,
      isr: sql<number>`sum(${nominaLineas.isrCents})::bigint`,
    })
    .from(nominaLineas)
    .innerJoin(nominaCorridas, eq(nominaCorridas.id, nominaLineas.corridaId))
    .where(previas)
    .groupBy(nominaLineas.empleadoId);
  // Los ingresos que no gravan ISR (sin la migración 0230 no hay conceptos: nada que restar).
  const exentos = await toleraMigracionPendiente(() => db
    .select({ empleadoId: nominaLineaConceptos.empleadoId, monto: sql<number>`sum(${nominaLineaConceptos.montoCents})::bigint` })
    .from(nominaLineaConceptos)
    .innerJoin(nominaCorridas, eq(nominaCorridas.id, nominaLineaConceptos.corridaId))
    .where(and(
      eq(nominaLineaConceptos.teamId, teamId), inArray(nominaLineaConceptos.empleadoId, empleadoIds), eq(nominaLineaConceptos.tipo, 'ingreso'),
      eq(nominaLineaConceptos.gravaIsr, false), inArray(nominaCorridas.estado, ['aprobada', 'pagada']), eq(nominaCorridas.periodo, periodo.periodo),
      periodo.tipo === 'quincenal-2' ? eq(nominaCorridas.tipo, 'quincenal-1') : and(eq(nominaCorridas.tipo, 'semanal'), lt(nominaCorridas.fechaInicio, periodo.inicio)),
    ))
    .groupBy(nominaLineaConceptos.empleadoId), []);
  const exentoDe = new Map(exentos.map((x) => [x.empleadoId, Number(x.monto)]));
  for (const f of filas) {
    mapa.set(f.empleadoId, {
      brutoCents: Number(f.bruto), afpCents: Number(f.afp), sfsCents: Number(f.sfs), isrCents: Number(f.isr), exentoCents: exentoDe.get(f.empleadoId) ?? 0,
    });
  }
  return mapa;
}

/** Las líneas de una corrida de ese período con los datos de hoy: salario, conceptos, ausencias y horas. */
async function calcularLineas(teamId: number, tipo: TipoCorrida, periodo: PeriodoCorrida) {
  const frecuencia = frecuenciaDeTipo(tipo);
  // Solo quien cobra con esta frecuencia: una mensual no le paga el mes entero a
  // quien cobra por quincenas.
  const filas = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.teamId, teamId), eq(empleados.frecuenciaPago, frecuencia)));

  // Piso del mínimo, tasa SRL y cápita: los de la empresa al inicio del período.
  // La cápita es mensual: en la mensual y las quincenas cuenta quien estuvo
  // registrado algún día del mes; en la semanal, algún día de la semana.
  const rangoDependientes = frecuencia === 'semanal' ? periodo : rangoDelMes(periodo.periodo);
  const [ajustes, dependientes, conceptos, ausencias, avanzado, previos, previoMes] = await Promise.all([
    ajustesNomina(teamId, periodo.inicio),
    adicionalesPorEmpleado(teamId, rangoDependientes.inicio, rangoDependientes.fin),
    conceptosParaCorrida(teamId, filas.map((e) => e.id), periodo.inicio, periodo.fin),
    ausenciasParaCorrida(teamId, filas.map((e) => e.id), periodo.inicio, periodo.fin),
    leerAvanzado(teamId),
    // En la 2.ª quincena, lo que ya cobró en la 1.ª (solo ingresos): el ISR del mes se mide con ello dentro.
    tipo === 'quincenal-2'
      ? conceptosParaCorrida(teamId, filas.map((e) => e.id), `${periodo.periodo}-01`, `${periodo.periodo}-15`)
      : Promise.resolve(new Map<number, ConceptoAplicable[]>()),
    previoDelMes(teamId, filas.map((e) => e.id), periodo),
  ]);

  // Quien cobra por hora: sus horas aprobadas, desde el lunes de la primera semana
  // para que el acumulado de horas extra de esa semana salga bien.
  const porHoras = filas.filter((e) => e.jornada === 'por_horas' && (e.tarifaHoraCents ?? 0) > 0);
  const pagoPorHoras = new Map<number, ResumenHoras>();
  if (porHoras.length > 0) {
    const registros = await db
      .select({ empleadoId: nominaHoras.empleadoId, fecha: nominaHoras.fecha, horas: nominaHoras.horas, horasNocturnas: nominaHoras.horasNocturnas, feriado: nominaHoras.feriado })
      .from(nominaHoras)
      .where(and(
        eq(nominaHoras.teamId, teamId),
        eq(nominaHoras.estado, 'aprobada'),
        inArray(nominaHoras.empleadoId, porHoras.map((e) => e.id)),
        gte(nominaHoras.fecha, inicioLecturaHoras(periodo)),
        lte(nominaHoras.fecha, finLecturaHoras(periodo)),
      ));
    for (const e of porHoras) {
      const suyos: RegistroHoras[] = registros
        .filter((r) => r.empleadoId === e.id)
        .map((r) => ({ fecha: r.fecha, horas: Number(r.horas), horasNocturnas: Number(r.horasNocturnas), feriado: r.feriado }));
      pagoPorHoras.set(e.id, clasificarHoras(suyos, e.tarifaHoraCents ?? 0, periodo));
    }
  }

  const anioTasas = Number(periodo.fin.slice(0, 4));
  const { lineas, totales } = construirCorrida(
    filas.map((e) => ({
      id: e.id, nombres: e.nombres, apellidos: e.apellidos, cedula: e.cedula,
      cargo: e.cargo, salarioBaseCents: e.salarioBaseCents, estado: e.estado,
      fechaIngreso: e.fechaIngreso, fechaSalida: e.fechaSalida,
      dispensaSalarioMinimo: e.dispensaSalarioMinimo,
      dependientesAdicionales: dependientes.get(e.id) ?? 0,
      vacacionesDias: e.vacacionesDias,
      horarioSemanal: e.horarioSemanal,
      // Sin horas aprobadas su resumen trae bruto 0 y la corrida no le hace línea.
      pagoPorHoras: pagoPorHoras.get(e.id),
      conceptos: conceptos.get(e.id),
      previoMes: previoMes.get(e.id),
      conceptosPrevios: (previos.get(e.id) ?? []).filter((c) => c.tipo === 'ingreso'),
      ausencias: ausencias.get(e.id),
    })),
    tasasDelAnio(anioTasas),
    periodo,
    {
      pisoCotizableCents: ajustes.pisoCotizableCents ?? undefined,
      srlTasa: ajustes.srlTasa ?? undefined,
      capitaDependienteCents: ajustes.capitaDependienteCents,
      avanzado,
    },
  );
  return { lineas, totales, anioTasas };
}

export async function generarCorrida(input: GenerarCorridaInput): Promise<GenerarCorridaResultado> {
  const { teamId, tipo, fechaPago = null, userId = null } = input;
  const periodo = periodoDeCorrida(tipo, { periodo: input.periodo, fechaInicio: input.fechaInicio });
  if (!periodo) return { creada: false, motivo: 'periodo-invalido' };

  const frecuencia = frecuenciaDeTipo(tipo);
  const [solape] = await db
    .select({ id: nominaCorridas.id, tipo: nominaCorridas.tipo, fechaInicio: nominaCorridas.fechaInicio, fechaFin: nominaCorridas.fechaFin })
    .from(nominaCorridas)
    .where(and(
      eq(nominaCorridas.teamId, teamId),
      inArray(nominaCorridas.tipo, tiposDeFrecuencia(frecuencia)),
      lte(nominaCorridas.fechaInicio, periodo.fin),
      gte(nominaCorridas.fechaFin, periodo.inicio),
    ))
    .limit(1);
  if (solape) return { creada: false, motivo: 'ya-existe', periodo, existente: solape };

  const { lineas, totales, anioTasas } = await calcularLineas(teamId, tipo, periodo);

  if (lineas.length === 0) return { creada: false, motivo: 'sin-empleados', periodo };

  try {
    const corrida = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(nominaCorridas)
        .values({
          teamId,
          periodo: periodo.periodo,
          fechaInicio: periodo.inicio,
          fechaFin: periodo.fin,
          descripcion: (input.descripcion?.trim() || descripcionDeCorrida(periodo)).slice(0, 160),
          tipo,
          fechaPago, estado: 'borrador', anioTasas,
          totalBrutoCents: totales.totalBrutoCents,
          totalDeduccionesCents: totales.totalDeduccionesCents,
          totalNetoCents: totales.totalNetoCents,
          totalPatronalCents: totales.totalPatronalCents,
          createdBy: userId,
        })
        .returning();

      const guardadas = await tx
        .insert(nominaLineas)
        .values(lineas.map(({ conceptos: _c, descuentoNoAplicadoCents: _n, ...l }) => ({ ...l, corridaId: c.id, teamId })))
        .returning({ id: nominaLineas.id, empleadoId: nominaLineas.empleadoId });
      const idPorEmpleado = new Map(guardadas.map((g) => [g.empleadoId, g.id]));
      await guardarConceptosDeLineas(tx, teamId, c.id, lineas.map((l) => ({
        lineaId: idPorEmpleado.get(l.empleadoId)!, empleadoId: l.empleadoId, conceptos: l.conceptos,
      })));
      return c;
    });

    return { creada: true, corridaId: corrida.id, lineas: lineas.length, totalNetoCents: totales.totalNetoCents, periodo };
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      return { creada: false, motivo: 'ya-existe', periodo, existente: null };
    }
    throw err;
  }
}

export type RecalcularResultado =
  | { ok: true; lineas: number; totalNetoCents: number; antesNetoCents: number }
  | { ok: false; motivo: 'no-existe' | 'no-borrador' | 'tipo-no-recalculable' | 'sin-empleados' };

/**
 * Vuelve a calcular un BORRADOR con los datos de hoy —conceptos, préstamos,
 * ausencias, horas, salarios— conservando la corrida (mismo número y descripción).
 * Sirve cuando cambió algo después de crearla: antes había que borrarla y rehacerla.
 * Solo las corridas de salario; la regalía y la liquidación se arman con su propio
 * formulario. Lo hace dentro de una transacción con la corrida bloqueada: si dos
 * personas la recalculan o la aprueban a la vez, una espera a la otra.
 */
export async function recalcularCorrida(teamId: number, corridaId: number): Promise<RecalcularResultado> {
  const [previa] = await db.select().from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId))).limit(1);
  if (!previa) return { ok: false, motivo: 'no-existe' };
  if (previa.estado !== 'borrador') return { ok: false, motivo: 'no-borrador' };
  const tipo = previa.tipo as TipoCorrida;
  if (tipo === ('regalia' as string) || tipo === ('liquidacion' as string)) return { ok: false, motivo: 'tipo-no-recalculable' };
  const periodo = periodoDeCorrida(tipo, tipo === 'semanal' ? { fechaInicio: previa.fechaInicio } : { periodo: previa.periodo });
  if (!periodo) return { ok: false, motivo: 'tipo-no-recalculable' };

  const { lineas, totales, anioTasas } = await calcularLineas(teamId, tipo, periodo);
  if (lineas.length === 0) return { ok: false, motivo: 'sin-empleados' };

  return db.transaction(async (tx) => {
    const [actual] = await tx.select({ estado: nominaCorridas.estado }).from(nominaCorridas)
      .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId))).for('update');
    if (!actual) return { ok: false, motivo: 'no-existe' } as const;
    if (actual.estado !== 'borrador') return { ok: false, motivo: 'no-borrador' } as const;

    // Los conceptos de las líneas caen por ON DELETE CASCADE.
    await tx.delete(nominaLineas).where(and(eq(nominaLineas.corridaId, corridaId), eq(nominaLineas.teamId, teamId)));
    const guardadas = await tx
      .insert(nominaLineas)
      .values(lineas.map(({ conceptos: _c, descuentoNoAplicadoCents: _n, ...l }) => ({ ...l, corridaId, teamId })))
      .returning({ id: nominaLineas.id, empleadoId: nominaLineas.empleadoId });
    const idPorEmpleado = new Map(guardadas.map((g) => [g.empleadoId, g.id]));
    await guardarConceptosDeLineas(tx, teamId, corridaId, lineas.map((l) => ({
      lineaId: idPorEmpleado.get(l.empleadoId)!, empleadoId: l.empleadoId, conceptos: l.conceptos,
    })));
    await tx.update(nominaCorridas).set({
      anioTasas,
      totalBrutoCents: totales.totalBrutoCents,
      totalDeduccionesCents: totales.totalDeduccionesCents,
      totalNetoCents: totales.totalNetoCents,
      totalPatronalCents: totales.totalPatronalCents,
    }).where(eq(nominaCorridas.id, corridaId));
    return { ok: true, lineas: lineas.length, totalNetoCents: totales.totalNetoCents, antesNetoCents: Number(previa.totalNetoCents) } as const;
  });
}
