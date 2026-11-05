/**
 * Corrida de regalía pascual (capa con BD; la aritmética vive en `./regalia`).
 *
 * Una corrida especial: una por año, para todos los empleados que trabajaron
 * algún día de ese año (sin importar su frecuencia de pago). Sale en borrador,
 * como cualquier corrida; aprobarla y pagarla usa el mismo camino de siempre.
 */

import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaConceptos, nominaLineaConceptos, nominaLineas, nominaLiquidaciones } from '@/lib/db/schema';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { ajustesNomina } from '@/lib/nomina/ajustes-db';
import { toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';
import { fraccionParaPromedio, esReingreso } from '@/lib/nomina/regalia';
import { regaliaNetaDeLoPagado } from '@/lib/nomina/liquidacion';
import { sumarDiasYMD, ultimoDiaDelMes } from '@/lib/nomina/periodos';
import { leerAvanzado } from '@/lib/nomina/avanzado-db';
import { topeRegaliaCents, type BaseRegalia } from '@/lib/nomina/avanzado';
import { esCandidatoRegalia, anioEnCurso, anioRegaliaValido, calcularRegalia, type CoberturaMes, desgloseDeRegalia, isrDeRegalia } from '@/lib/nomina/regalia';

export const TIPOS_REGULARES_SQL = ['mensual', 'quincenal', 'quincenal-1', 'quincenal-2', 'semanal'];

export type GenerarRegaliaResultado =
  | { creada: true; corridaId: number; lineas: number; totalNetoCents: number; avisos: string[] }
  | { creada: false; motivo: 'anio-invalido' | 'sin-empleados' | 'ya-existe'; corridaId?: number };

export { anioRegaliaValido };

export interface DevengadoYCobertura {
  devengado: Map<number, Record<string, number>>;
  /** Fracción del mes que pagaron las nóminas (días pagados ÷ días del mes, tope 1). Falta si no se sabe. */
  fraccionPagada: Map<number, Record<string, number>>;
  cobertura: Map<number, Record<string, CoberturaMes>>;
}

/**
 * Lo devengado por empleado y mes ('YYYY-MM') en las nóminas aprobadas del año, y qué
 * quincenas de cada mes cubren esas nóminas. No cuenta las regalías ni las liquidaciones:
 * solo las corridas de sueldo.
 */
export async function devengadoYCobertura(teamId: number, empleadoIds: number[], anio: number, base: BaseRegalia = 'todo', excluirHorasExtra = false): Promise<DevengadoYCobertura> {
  const devengado = new Map<number, Record<string, number>>();
  const cobertura = new Map<number, Record<string, CoberturaMes>>();
  const fraccionPagada = new Map<number, Record<string, number>>();
  if (empleadoIds.length === 0) return { devengado, cobertura, fraccionPagada };
  const fechasEmpleados = new Map(
    (await db.select({ id: empleados.id, ingreso: empleados.fechaIngreso, salida: empleados.fechaSalida }).from(empleados)
      .where(and(eq(empleados.teamId, teamId), inArray(empleados.id, empleadoIds)))).map((x) => [x.id, x]),
  );
  const filas = await db
    .select({
      empleadoId: nominaLineas.empleadoId,
      mes: nominaCorridas.periodo,
      tipo: nominaCorridas.tipo,
      bruto: sql<number>`sum(${nominaLineas.brutoCents})::bigint`,
      diasSemana: sql<number>`sum(coalesce(${nominaLineas.diasPeriodo}, 7))::int`,
      diasPagados: sql<number | null>`sum(${nominaLineas.diasPagados})::int`,
      conHoras: sql<boolean>`coalesce(bool_or(${nominaLineas.horasDetalle} is not null), false)`,
    })
    .from(nominaLineas)
    .innerJoin(nominaCorridas, eq(nominaCorridas.id, nominaLineas.corridaId))
    .where(and(
      eq(nominaLineas.teamId, teamId),
      inArray(nominaCorridas.estado, ['aprobada', 'pagada']),
      inArray(nominaCorridas.tipo, TIPOS_REGULARES_SQL),
      like(nominaCorridas.periodo, `${anio}-%`),
      inArray(nominaLineas.empleadoId, empleadoIds),
    ))
    .groupBy(nominaLineas.empleadoId, nominaCorridas.periodo, nominaCorridas.tipo);
  for (const d of filas) {
    const m = devengado.get(d.empleadoId) ?? {};
    m[d.mes] = (m[d.mes] ?? 0) + Number(d.bruto);
    devengado.set(d.empleadoId, m);
    const fechas = fechasEmpleados.get(d.empleadoId);
    const frac = fraccionParaPromedio({
      semanal: d.tipo === 'semanal', conHoras: !!d.conHoras, diasPagados: d.diasPagados === null ? null : Number(d.diasPagados),
      mes: d.mes, ingreso: fechas?.ingreso ?? null, salida: fechas?.salida ?? null,
    });
    if (frac !== null) {
      const f = fraccionPagada.get(d.empleadoId) ?? {};
      const porContrato = d.tipo === 'semanal' || !!d.conHoras;
      // Semanal o por horas: la fracción es la contratada (no se suma por línea); el resto suma lo pagado.
      f[d.mes] = porContrato ? Math.max(f[d.mes] ?? 0, frac) : Math.min(1, (f[d.mes] ?? 0) + frac);
      fraccionPagada.set(d.empleadoId, f);
    }
    const c = cobertura.get(d.empleadoId) ?? {};
    const previa = c[d.mes] ?? { q1: false, q2: false };
    if (d.tipo === 'semanal') {
      // Una semana pagada cubre solo sus días, no el mes.
      c[d.mes] = { ...previa, diasSemanales: (previa.diasSemanales ?? 0) + Number(d.diasSemana) };
    } else {
      // Mensual o quincenal «a secas» (corridas viejas): el mes entero.
      c[d.mes] = {
        ...previa,
        q1: previa.q1 || d.tipo !== 'quincenal-2',
        q2: previa.q2 || d.tipo !== 'quincenal-1',
      };
    }
    cobertura.set(d.empleadoId, c);
  }
  // Base «solo salario ordinario»: se restan los ingresos variables (incentivos, comisiones, horas extra…)
  // que las nóminas aprobadas sumaron al bruto. Sin la migración 0230 no hay conceptos que restar.
  if (base === 'ordinario' || excluirHorasExtra) {
    const variables = await toleraMigracionPendiente(() => db
      .select({
        empleadoId: nominaLineaConceptos.empleadoId,
        mes: nominaCorridas.periodo,
        monto: sql<number>`sum(${nominaLineaConceptos.montoCents})::bigint`,
      })
      .from(nominaLineaConceptos)
      .innerJoin(nominaCorridas, eq(nominaCorridas.id, nominaLineaConceptos.corridaId))
      .leftJoin(nominaConceptos, eq(nominaConceptos.id, nominaLineaConceptos.conceptoId))
      .where(and(
        eq(nominaLineaConceptos.teamId, teamId),
        eq(nominaLineaConceptos.tipo, 'ingreso'),
        // «Ordinario» resta todos los ingresos variables; si no, solo las horas extra.
        base === 'ordinario' ? undefined : eq(nominaConceptos.codigo, 'horas-extra'),
        inArray(nominaCorridas.estado, ['aprobada', 'pagada']),
        inArray(nominaCorridas.tipo, TIPOS_REGULARES_SQL),
        like(nominaCorridas.periodo, `${anio}-%`),
        inArray(nominaLineaConceptos.empleadoId, empleadoIds),
      ))
      .groupBy(nominaLineaConceptos.empleadoId, nominaCorridas.periodo), []);
    for (const v of variables) {
      const m = devengado.get(v.empleadoId);
      if (m && m[v.mes] !== undefined) m[v.mes] = Math.max(0, m[v.mes] - Number(v.monto));
    }
  }
  return { devengado, cobertura, fraccionPagada };
}

/** Solo lo devengado por mes (lo usa la liquidación). */
export async function devengadoPorEmpleadoYMes(teamId: number, empleadoIds: number[], anio: number): Promise<Map<number, Record<string, number>>> {
  return (await devengadoYCobertura(teamId, empleadoIds, anio)).devengado;
}

type LineasRegalia = {
  lineas: { e: typeof empleados.$inferSelect; r: ReturnType<typeof calcularRegalia>; d: ReturnType<typeof desgloseDeRegalia> }[];
  totales: { bruto: number; ded: number; neto: number };
  avisos: string[];
};

/** Las líneas de la regalía de un año con los datos de hoy: una por empleado que trabajó ese año. */
async function armarLineasRegalia(teamId: number, anio: number, hoy: string): Promise<LineasRegalia | null> {
  const fin = `${anio}-12-31`;
  const todos = await db.select().from(empleados).where(eq(empleados.teamId, teamId));
  // Quien se liquidó ese año ya cobró su regalía proporcional en la liquidación.
  // Sin la migración 0233 todavía no hay liquidaciones: nadie queda excluido.
  const liquidaciones = await toleraMigracionPendiente(() => db
    .select({ empleadoId: nominaLiquidaciones.empleadoId, fechaIngreso: nominaLiquidaciones.fechaIngreso, fechaSalida: nominaLiquidaciones.fechaSalida, componentes: nominaLiquidaciones.componentes })
    .from(nominaLiquidaciones)
    .where(and(eq(nominaLiquidaciones.teamId, teamId), like(sql`${nominaLiquidaciones.fechaSalida}::text`, `${anio}-%`))), []);
  // Quien reingresó DESPUÉS de su liquidación sigue trabajando: cobra la regalía de todo el año menos lo que
  // la liquidación ya le pagó. Quien no reingresó ya cobró la suya completa en la liquidación.
  const liquidados = new Set<number>();
  const yaCobrado = new Map<number, number>();
  // Su empleo original y el hueco entre la salida y el reingreso: la regalía del año cuenta los dos tramos.
  const tramos = new Map<number, { ingresoOriginal: string; hueco: { desde: string; hasta: string } }>();
  for (const l of liquidaciones) {
    const emp = todos.find((x) => x.id === l.empleadoId);
    const reingreso = !!emp && esReingreso(emp, l.fechaSalida);
    if (!reingreso) { liquidados.add(l.empleadoId); continue; }
    const comp = (Array.isArray(l.componentes) ? l.componentes : []) as { clave?: string; montoCents?: number }[];
    const regalia = comp.filter((c) => c.clave === 'regalia').reduce((t, c) => t + Number(c.montoCents ?? 0), 0);
    yaCobrado.set(l.empleadoId, (yaCobrado.get(l.empleadoId) ?? 0) + regalia);
    if (emp && emp.fechaIngreso) {
      tramos.set(l.empleadoId, { ingresoOriginal: l.fechaIngreso, hueco: { desde: sumarDiasYMD(l.fechaSalida, 1), hasta: sumarDiasYMD(emp.fechaIngreso, -1) } });
    }
  }
  const candidatos = todos.filter((e) => esCandidatoRegalia(e, anio, liquidados.has(e.id)));
  if (candidatos.length === 0) return null;

  const avanzado = await leerAvanzado(teamId);
  const { devengado: porEmpleado, cobertura } = await devengadoYCobertura(teamId, candidatos.map((e) => e.id), anio, avanzado.regaliaBase);

  const ajustes = await ajustesNomina(teamId, fin);
  const tasas = tasasDelAnio(anio);
  const topeExento = topeRegaliaCents(ajustes.pisoCotizableCents);
  const avisos: string[] = [];
  if (anioEnCurso(anio, hoy)) avisos.push('El año aún no termina: los meses que faltan por pagar (y las quincenas sin nómina) se estimaron con el salario de la ficha. Revisa la corrida antes de aprobarla.');
  if (topeExento === null) avisos.push('La empresa no tiene configurado su tamaño: no se conoce el tope de 5 salarios mínimos y toda la regalía se trató como exenta de ISR.');

  const lineas = candidatos.map((e) => {
    const calculada = calcularRegalia({
      anio, salarioMensualCents: e.salarioBaseCents,
      fechaIngreso: tramos.get(e.id)?.ingresoOriginal ?? e.fechaIngreso, fechaSalida: e.fechaSalida,
      huecos: tramos.has(e.id) ? [tramos.get(e.id)!.hueco] : undefined,
      devengadoPorMes: porEmpleado.get(e.id) ?? {}, coberturaPorMes: cobertura.get(e.id), topeExentoCents: topeExento,
    });
    const r = regaliaNetaDeLoPagado(calculada, yaCobrado.get(e.id) ?? 0);
    const base = calcularNominaEmpleado({
      salarioMensualCents: e.salarioBaseCents, tasas, pisoCotizableCents: e.dispensaSalarioMinimo ? 0 : (ajustes.pisoCotizableCents ?? 0), srlTasa: ajustes.srlTasa ?? undefined,
    });
    const isr = isrDeRegalia(r.gravadoCents, base.baseIsrMensualCents, tasas.isrEscala);
    if (r.mesesEstimados.length > 0) {
      avisos.push(`${[e.nombres, e.apellidos].join(' ')}: ${r.mesesEstimados.length} mes(es) sin nómina en Zero se estimaron con su salario de la ficha.`);
    }
    return { e, r, d: desgloseDeRegalia(r.regaliaCents, isr) };
  }).filter((x) => x.r.regaliaCents > 0);
  if (lineas.length === 0) return null;

  const totales = lineas.reduce((t, x) => ({
    bruto: t.bruto + x.d.brutoCents, ded: t.ded + x.d.totalDeduccionesCents, neto: t.neto + x.d.netoCents,
  }), { bruto: 0, ded: 0, neto: 0 });
  return { lineas, totales, avisos };
}

const filasDeLineas = (lineas: LineasRegalia['lineas'], corridaId: number, teamId: number) => lineas.map(({ e, d }) => ({
  corridaId, teamId, empleadoId: e.id,
  nombre: [e.nombres, e.apellidos].filter(Boolean).join(' ').trim(), cedula: e.cedula, cargo: e.cargo,
  brutoCents: d.brutoCents, afpEmpleadoCents: 0, sfsEmpleadoCents: 0, isrCents: d.isrCents,
  otrasDeduccionesCents: 0, totalDeduccionesCents: d.totalDeduccionesCents,
  afpPatronalCents: 0, sfsPatronalCents: 0, srlPatronalCents: 0, infotepPatronalCents: 0, totalPatronalCents: 0,
  netoCents: d.netoCents, salarioCotizableCents: 0, dependientesAdicionales: 0, dependientesAdicionalesCents: 0,
  diasPagados: null, diasPeriodo: null,
  provisionRegaliaCents: 0, provisionVacacionesCents: 0, provisionCesantiaCents: 0,
}));

export async function generarCorridaRegalia(input: {
  teamId: number; anio: number; hoy: string; fechaPago?: string | null; descripcion?: string; userId?: number | null;
}): Promise<GenerarRegaliaResultado> {
  const { teamId, anio, hoy, userId = null } = input;
  if (!anioRegaliaValido(anio, hoy)) return { creada: false, motivo: 'anio-invalido' };

  const [previa] = await db
    .select({ id: nominaCorridas.id })
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.teamId, teamId), eq(nominaCorridas.tipo, 'regalia'), eq(nominaCorridas.fechaInicio, `${anio}-01-01`)))
    .limit(1);
  if (previa) return { creada: false, motivo: 'ya-existe', corridaId: previa.id };

  const armado = await armarLineasRegalia(teamId, anio, hoy);
  if (!armado) return { creada: false, motivo: 'sin-empleados' };
  const { lineas, totales, avisos } = armado;

  const fechaPago = input.fechaPago ?? `${anio}-12-20`;
  try {
    const corrida = await db.transaction(async (tx) => {
      const [c] = await tx.insert(nominaCorridas).values({
        teamId, periodo: `${anio}-12`, fechaInicio: `${anio}-01-01`, fechaFin: `${anio}-12-31`,
        descripcion: (input.descripcion?.trim() || `Regalía pascual ${anio}`).slice(0, 160),
        tipo: 'regalia', fechaPago, estado: 'borrador', anioTasas: anio,
        totalBrutoCents: totales.bruto, totalDeduccionesCents: totales.ded, totalNetoCents: totales.neto, totalPatronalCents: 0,
        createdBy: userId,
      }).returning();
      await tx.insert(nominaLineas).values(filasDeLineas(lineas, c.id, teamId));
      return c;
    });
    return { creada: true, corridaId: corrida.id, lineas: lineas.length, totalNetoCents: totales.neto, avisos };
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) return { creada: false, motivo: 'ya-existe' };
    throw err;
  }
}

export type RecalcularRegaliaResultado =
  | { ok: true; lineas: number; totalNetoCents: number; avisos: string[] }
  | { ok: false; motivo: 'no-existe' | 'no-borrador' | 'no-es-regalia' | 'sin-empleados' };

/**
 * Vuelve a armar una corrida de regalía en BORRADOR con los datos de hoy, conservando su número y su
 * descripción. Sirve para sacar a quien se liquidó después de crearla, o para tomar nóminas nuevas,
 * sin borrarla entera. Con la corrida bloqueada: dos recálculos o una aprobación a la vez se esperan.
 */
export async function recalcularCorridaRegalia(teamId: number, corridaId: number, hoy: string): Promise<RecalcularRegaliaResultado> {
  const [previa] = await db.select().from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId))).limit(1);
  if (!previa) return { ok: false, motivo: 'no-existe' };
  if (previa.tipo !== 'regalia') return { ok: false, motivo: 'no-es-regalia' };
  if (previa.estado !== 'borrador') return { ok: false, motivo: 'no-borrador' };
  const anio = Number(previa.fechaInicio.slice(0, 4));

  const armado = await armarLineasRegalia(teamId, anio, hoy);
  if (!armado) return { ok: false, motivo: 'sin-empleados' };
  const { lineas, totales, avisos } = armado;

  return db.transaction(async (tx) => {
    const [actual] = await tx.select({ estado: nominaCorridas.estado }).from(nominaCorridas)
      .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId))).for('update');
    if (!actual) return { ok: false, motivo: 'no-existe' } as const;
    if (actual.estado !== 'borrador') return { ok: false, motivo: 'no-borrador' } as const;
    await tx.delete(nominaLineas).where(and(eq(nominaLineas.corridaId, corridaId), eq(nominaLineas.teamId, teamId)));
    await tx.insert(nominaLineas).values(filasDeLineas(lineas, corridaId, teamId));
    await tx.update(nominaCorridas).set({
      totalBrutoCents: totales.bruto, totalDeduccionesCents: totales.ded, totalNetoCents: totales.neto, totalPatronalCents: 0,
    }).where(eq(nominaCorridas.id, corridaId));
    return { ok: true, lineas: lineas.length, totalNetoCents: totales.neto, avisos } as const;
  });
}

/**
 * Líneas de una corrida de regalía que pertenecen a empleados liquidados ese año que NO reingresaron:
 * ya cobraron su regalía en la liquidación y no deberían estar. Cierre de seguridad al aprobar (cubre la
 * carrera de generar la regalía mientras otro registra la liquidación).
 */
export async function lineasDeLiquidadosEnRegalia(teamId: number, corridaId: number, anio: number): Promise<string[]> {
  return toleraMigracionPendiente(async () => {
    const filas = await db
      .select({
        nombre: nominaLineas.nombre, estado: empleados.estado, fechaIngreso: empleados.fechaIngreso, fechaSalida: nominaLiquidaciones.fechaSalida,
      })
      .from(nominaLineas)
      .innerJoin(empleados, eq(empleados.id, nominaLineas.empleadoId))
      .innerJoin(nominaLiquidaciones, and(eq(nominaLiquidaciones.empleadoId, nominaLineas.empleadoId), like(sql`${nominaLiquidaciones.fechaSalida}::text`, `${anio}-%`)))
      .where(and(eq(nominaLineas.corridaId, corridaId), eq(nominaLineas.teamId, teamId)));
    return filas.filter((f) => !esReingreso(f, f.fechaSalida)).map((f) => f.nombre);
  }, []);
}
