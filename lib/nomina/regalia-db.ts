/**
 * Corrida de regalía pascual (capa con BD; la aritmética vive en `./regalia`).
 *
 * Una corrida especial: una por año, para todos los empleados que trabajaron
 * algún día de ese año (sin importar su frecuencia de pago). Sale en borrador,
 * como cualquier corrida; aprobarla y pagarla usa el mismo camino de siempre.
 */

import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { ajustesNomina } from '@/lib/nomina/ajustes-db';
import { calcularRegalia, desgloseDeRegalia, isrDeRegalia } from '@/lib/nomina/regalia';

export const TIPOS_REGULARES_SQL = ['mensual', 'quincenal', 'quincenal-1', 'quincenal-2', 'semanal'];

export type GenerarRegaliaResultado =
  | { creada: true; corridaId: number; lineas: number; totalNetoCents: number; avisos: string[] }
  | { creada: false; motivo: 'anio-invalido' | 'sin-empleados' | 'ya-existe'; corridaId?: number };

/** Año calendario válido para una regalía: de 2000 al actual (la del año que viene aún no se devenga). */
export function anioRegaliaValido(anio: unknown, hoy: string): anio is number {
  return typeof anio === 'number' && Number.isInteger(anio) && anio >= 2000 && anio <= Number(hoy.slice(0, 4));
}

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

  const inicio = `${anio}-01-01`;
  const fin = `${anio}-12-31`;
  const todos = await db.select().from(empleados).where(eq(empleados.teamId, teamId));
  // Trabajó algún día del año: ingresó antes de que termine y no salió antes de que empiece.
  const candidatos = todos.filter((e) => (!e.fechaIngreso || e.fechaIngreso <= fin) && (!e.fechaSalida || e.fechaSalida >= inicio));
  if (candidatos.length === 0) return { creada: false, motivo: 'sin-empleados' };

  // Lo devengado por empleado y mes, de las nóminas ya aprobadas del año (no las regalías ni liquidaciones).
  const devengado = await db
    .select({
      empleadoId: nominaLineas.empleadoId,
      mes: nominaCorridas.periodo,
      bruto: sql<number>`sum(${nominaLineas.brutoCents})::bigint`,
    })
    .from(nominaLineas)
    .innerJoin(nominaCorridas, eq(nominaCorridas.id, nominaLineas.corridaId))
    .where(and(
      eq(nominaLineas.teamId, teamId),
      inArray(nominaCorridas.estado, ['aprobada', 'pagada']),
      inArray(nominaCorridas.tipo, TIPOS_REGULARES_SQL),
      like(nominaCorridas.periodo, `${anio}-%`),
      inArray(nominaLineas.empleadoId, candidatos.map((e) => e.id)),
    ))
    .groupBy(nominaLineas.empleadoId, nominaCorridas.periodo);
  const porEmpleado = new Map<number, Record<string, number>>();
  for (const d of devengado) {
    const m = porEmpleado.get(d.empleadoId) ?? {};
    m[d.mes] = Number(d.bruto);
    porEmpleado.set(d.empleadoId, m);
  }

  const ajustes = await ajustesNomina(teamId, fin);
  const tasas = tasasDelAnio(anio);
  const topeExento = ajustes.pisoCotizableCents ? 5 * ajustes.pisoCotizableCents : null;
  const avisos: string[] = [];
  if (topeExento === null) avisos.push('La empresa no tiene configurado su tamaño: no se conoce el tope de 5 salarios mínimos y toda la regalía se trató como exenta de ISR.');

  const lineas = candidatos.map((e) => {
    const r = calcularRegalia({
      anio, salarioMensualCents: e.salarioBaseCents, fechaIngreso: e.fechaIngreso, fechaSalida: e.fechaSalida,
      devengadoPorMes: porEmpleado.get(e.id) ?? {}, topeExentoCents: topeExento,
    });
    const base = calcularNominaEmpleado({
      salarioMensualCents: e.salarioBaseCents, tasas, pisoCotizableCents: e.dispensaSalarioMinimo ? 0 : (ajustes.pisoCotizableCents ?? 0), srlTasa: ajustes.srlTasa ?? undefined,
    });
    const isr = isrDeRegalia(r.gravadoCents, base.baseIsrMensualCents, tasas.isrEscala);
    if (r.mesesEstimados.length > 0) {
      avisos.push(`${[e.nombres, e.apellidos].join(' ')}: ${r.mesesEstimados.length} mes(es) sin nómina en Zero se estimaron con su salario de la ficha.`);
    }
    return { e, r, d: desgloseDeRegalia(r.regaliaCents, isr) };
  }).filter((x) => x.r.regaliaCents > 0);
  if (lineas.length === 0) return { creada: false, motivo: 'sin-empleados' };

  const totales = lineas.reduce((t, x) => ({
    bruto: t.bruto + x.d.brutoCents, ded: t.ded + x.d.totalDeduccionesCents, neto: t.neto + x.d.netoCents,
  }), { bruto: 0, ded: 0, neto: 0 });

  const fechaPago = input.fechaPago ?? `${anio}-12-20`;
  try {
    const corrida = await db.transaction(async (tx) => {
      const [c] = await tx.insert(nominaCorridas).values({
        teamId, periodo: `${anio}-12`, fechaInicio: inicio, fechaFin: fin,
        descripcion: (input.descripcion?.trim() || `Regalía pascual ${anio}`).slice(0, 160),
        tipo: 'regalia', fechaPago, estado: 'borrador', anioTasas: anio,
        totalBrutoCents: totales.bruto, totalDeduccionesCents: totales.ded, totalNetoCents: totales.neto, totalPatronalCents: 0,
        createdBy: userId,
      }).returning();
      await tx.insert(nominaLineas).values(lineas.map(({ e, d }) => ({
        corridaId: c.id, teamId, empleadoId: e.id,
        nombre: [e.nombres, e.apellidos].filter(Boolean).join(' ').trim(), cedula: e.cedula, cargo: e.cargo,
        brutoCents: d.brutoCents, afpEmpleadoCents: 0, sfsEmpleadoCents: 0, isrCents: d.isrCents,
        otrasDeduccionesCents: 0, totalDeduccionesCents: d.totalDeduccionesCents,
        afpPatronalCents: 0, sfsPatronalCents: 0, srlPatronalCents: 0, infotepPatronalCents: 0, totalPatronalCents: 0,
        netoCents: d.netoCents, salarioCotizableCents: 0, dependientesAdicionales: 0, dependientesAdicionalesCents: 0,
        diasPagados: null, diasPeriodo: null,
        provisionRegaliaCents: 0, provisionVacacionesCents: 0, provisionCesantiaCents: 0,
      })));
      return c;
    });
    return { creada: true, corridaId: corrida.id, lineas: lineas.length, totalNetoCents: totales.neto, avisos };
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) return { creada: false, motivo: 'ya-existe' };
    throw err;
  }
}
