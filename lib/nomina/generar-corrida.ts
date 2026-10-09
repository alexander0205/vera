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
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaHoras, nominaLineas } from '@/lib/db/schema';
import { clasificarHoras, finLecturaHoras, inicioLecturaHoras, type RegistroHoras, type ResumenHoras } from '@/lib/nomina/horas';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import {
  construirCorrida, frecuenciaDeTipo, LABEL_TIPO_CORRIDA, periodoDeCorrida, tiposDeFrecuencia,
  type PeriodoCorrida, type TipoCorrida,
} from '@/lib/nomina/corrida';
import { adicionalesPorEmpleado, ajustesNomina } from '@/lib/nomina/ajustes-db';
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
  const [ajustes, dependientes] = await Promise.all([
    ajustesNomina(teamId, periodo.inicio),
    adicionalesPorEmpleado(teamId, rangoDependientes.inicio, rangoDependientes.fin),
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
      // Sin horas aprobadas su resumen trae bruto 0 y la corrida no le hace línea.
      pagoPorHoras: pagoPorHoras.get(e.id),
    })),
    tasasDelAnio(anioTasas),
    periodo,
    {
      pisoCotizableCents: ajustes.pisoCotizableCents ?? undefined,
      srlTasa: ajustes.srlTasa ?? undefined,
      capitaDependienteCents: ajustes.capitaDependienteCents,
    },
  );

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

      await tx.insert(nominaLineas).values(
        lineas.map((l) => ({ ...l, corridaId: c.id, teamId })),
      );
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
