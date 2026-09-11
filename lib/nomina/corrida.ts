/**
 * Constructor de corridas de nómina — función pura, sin BD.
 *
 * Toma los empleados activos y las tasas del año, corre el motor de cálculo
 * sobre cada uno y devuelve las líneas (con snapshot de identidad) más los
 * totales de la corrida. La ruta API se encarga de leer los empleados de la
 * base y de insertar; aquí solo está la aritmética, para poder probarla sola.
 */

import { calcularNominaEmpleado, prorratearDesglose } from '@/lib/nomina/calculo';
import type { TasasNomina } from '@/lib/config/nomina-tasas';

/** Cómo se reparte el mes: qué período (`indice`) de cuántos (`deTotal`). */
export interface Proration {
  indice: number;
  deTotal: number;
}

/** Mensual = mes entero. Sin proración. */
export const SIN_PRORATEO: Proration = { indice: 1, deTotal: 1 };

/**
 * Proración según el tipo de corrida. La quincena calcula el mes completo y se
 * queda con su mitad (quincenal-1 = 1ra, quincenal-2 = 2da; las dos suman el
 * mes al centavo). 'semanal' aproxima el mes a 4 semanas.
 */
export function prorationDeTipo(tipo: string): Proration {
  switch (tipo) {
    case 'quincenal':
    case 'quincenal-1': return { indice: 1, deTotal: 2 };
    case 'quincenal-2': return { indice: 2, deTotal: 2 };
    case 'semanal':     return { indice: 1, deTotal: 4 };
    default:            return SIN_PRORATEO; // mensual
  }
}

/** Lo mínimo del empleado que necesita la corrida. */
export interface EmpleadoParaCorrida {
  id: number;
  nombres: string;
  apellidos: string;
  cedula: string | null;
  cargo: string | null;
  salarioBaseCents: number;
  estado: string;
}

/** Una línea calculada, lista para insertar (le falta solo corridaId/teamId). */
export interface LineaCalculada {
  empleadoId: number;
  nombre: string;
  cedula: string | null;
  cargo: string | null;
  brutoCents: number;
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  isrCents: number;
  otrasDeduccionesCents: number;
  totalDeduccionesCents: number;
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
  totalPatronalCents: number;
  netoCents: number;
}

export interface TotalesCorrida {
  totalBrutoCents: number;
  totalDeduccionesCents: number;
  totalNetoCents: number;
  totalPatronalCents: number;
}

export interface CorridaCalculada {
  lineas: LineaCalculada[];
  totales: TotalesCorrida;
}

const nombreCompleto = (e: EmpleadoParaCorrida) =>
  [e.nombres, e.apellidos].filter(Boolean).join(' ').trim();

/**
 * Construye la corrida. Solo entran empleados activos; el salario base se toma
 * como base MENSUAL para el cálculo TSS/ISR (topes y escala se aplican sobre el
 * mes). Si la corrida es de una fracción del mes (quincenal/semanal), el
 * resultado mensual se prorratea por período — ver `prorratearDesglose`.
 */
export function construirCorrida(
  empleados: EmpleadoParaCorrida[],
  tasas: TasasNomina,
  proration: Proration = SIN_PRORATEO,
): CorridaCalculada {
  const lineas: LineaCalculada[] = [];
  const totales: TotalesCorrida = {
    totalBrutoCents: 0,
    totalDeduccionesCents: 0,
    totalNetoCents: 0,
    totalPatronalCents: 0,
  };

  for (const e of empleados) {
    if (e.estado !== 'activo') continue;
    const mensual = calcularNominaEmpleado({ salarioMensualCents: e.salarioBaseCents, tasas });
    const d = prorratearDesglose(mensual, proration.indice, proration.deTotal);

    lineas.push({
      empleadoId: e.id,
      nombre: nombreCompleto(e),
      cedula: e.cedula,
      cargo: e.cargo,
      brutoCents: d.brutoCents,
      afpEmpleadoCents: d.afpEmpleadoCents,
      sfsEmpleadoCents: d.sfsEmpleadoCents,
      isrCents: d.isrCents,
      otrasDeduccionesCents: d.otrasDeduccionesCents,
      totalDeduccionesCents: d.totalDeduccionesCents,
      afpPatronalCents: d.afpPatronalCents,
      sfsPatronalCents: d.sfsPatronalCents,
      srlPatronalCents: d.srlPatronalCents,
      infotepPatronalCents: d.infotepPatronalCents,
      totalPatronalCents: d.totalPatronalCents,
      netoCents: d.netoCents,
    });

    totales.totalBrutoCents += d.brutoCents;
    totales.totalDeduccionesCents += d.totalDeduccionesCents;
    totales.totalNetoCents += d.netoCents;
    totales.totalPatronalCents += d.totalPatronalCents;
  }

  return { lineas, totales };
}
