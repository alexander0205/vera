/**
 * Constructor de corridas de nómina — función pura, sin BD.
 *
 * Una corrida paga un RANGO de fechas (del 1 al 15 de noviembre, la semana del 2
 * al 8…). Por cada empleado se cuentan los días de ese rango en que estuvo
 * contratado —entre su ingreso y su salida— y se le paga esa parte. La ruta API
 * lee los empleados y guarda; aquí solo está la aritmética, para probarla sola.
 */

import { calcularNominaEmpleado, pedazoPeriodo, repartirDesglose, type DesgloseNomina } from '@/lib/nomina/calculo';
import type { TasasNomina } from '@/lib/config/nomina-tasas';
import { calcularProvisionesPeriodo } from '@/lib/nomina/provisiones';
import type { ResumenHoras } from '@/lib/nomina/horas';
import {
  diasDelRango, esFechaYMD, esMes, interseccion, rangoDelMes, semanaDelAnio, sumarDiasYMD, type Rango,
} from '@/lib/nomina/periodos';

/**
 * Los tipos de corrida que existen. Todo lo demás se rechaza.
 *
 * Antes era texto libre y cualquier cosa caía a «mensual»: una corrida con tipo
 * «regalia» pagaba un mes ordinario con AFP, SFS e ISR descontados, justo lo que
 * la regalía no lleva. Hasta que la regalía, la bonificación y la liquidación
 * tengan su propio cálculo, no se aceptan.
 */
export const TIPOS_CORRIDA = ['mensual', 'quincenal-1', 'quincenal-2', 'semanal'] as const;
export type TipoCorrida = (typeof TIPOS_CORRIDA)[number];

/** Cómo se lee cada tipo en pantalla. «quincenal» a secas es de corridas viejas. */
export const LABEL_TIPO_CORRIDA: Record<string, string> = {
  mensual: 'Mensual',
  'quincenal-1': '1ra quincena',
  'quincenal-2': '2da quincena',
  quincenal: '1ra quincena',
  semanal: 'Semanal',
};

/**
 * El tipo tal como se guarda, o null si no es válido. «quincenal» a secas —lo
 * que mandaba el diálogo viejo— es la primera quincena: se normaliza para que no
 * conviva con una «quincenal-1» del mismo mes.
 */
export function normalizarTipoCorrida(tipo: unknown): TipoCorrida | null {
  const t = String(tipo ?? '').trim().toLowerCase();
  if (t === 'quincenal') return 'quincenal-1';
  return (TIPOS_CORRIDA as readonly string[]).includes(t) ? (t as TipoCorrida) : null;
}

export type FrecuenciaPago = 'mensual' | 'quincenal' | 'semanal';

/**
 * A quién le paga cada tipo: a los empleados que cobran con esa frecuencia. Una
 * corrida mensual que incluyera a quien cobra por quincenas le pagaría el mes
 * entero además de sus dos quincenas.
 */
export function frecuenciaDeTipo(tipo: TipoCorrida): FrecuenciaPago {
  if (tipo === 'semanal') return 'semanal';
  return tipo === 'mensual' ? 'mensual' : 'quincenal';
}

/** Los tipos guardados que comparten calendario con una frecuencia (para detectar solapes). */
export function tiposDeFrecuencia(f: FrecuenciaPago): string[] {
  if (f === 'quincenal') return ['quincenal', 'quincenal-1', 'quincenal-2'];
  return [f];
}

/** Las fechas que paga una corrida y su mes contable 'YYYY-MM'. */
export interface PeriodoCorrida extends Rango {
  tipo: TipoCorrida;
  periodo: string;
}

/**
 * El período de una corrida. La mensual y las quincenas se piden por mes: la
 * 1ra paga del 1 al 15 y la 2da del 16 al último día. La semanal se pide por su
 * primer día y paga siete; su mes contable es el del último día, que es cuando
 * se paga. Null si falta el dato o no es una fecha real.
 */
export function periodoDeCorrida(
  tipo: TipoCorrida,
  datos: { periodo?: unknown; fechaInicio?: unknown },
): PeriodoCorrida | null {
  if (tipo === 'semanal') {
    if (!esFechaYMD(datos.fechaInicio)) return null;
    const fin = sumarDiasYMD(datos.fechaInicio, 6);
    return { tipo, inicio: datos.fechaInicio, fin, periodo: fin.slice(0, 7) };
  }
  if (!esMes(datos.periodo)) return null;
  const mes = rangoDelMes(datos.periodo);
  if (tipo === 'quincenal-1') return { tipo, periodo: datos.periodo, inicio: mes.inicio, fin: `${datos.periodo}-15` };
  if (tipo === 'quincenal-2') return { tipo, periodo: datos.periodo, inicio: `${datos.periodo}-16`, fin: mes.fin };
  return { tipo, periodo: datos.periodo, ...mes };
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
  /** Primer día trabajado, 'YYYY-MM-DD'. Null = desde siempre. */
  fechaIngreso?: string | null;
  /** Último día trabajado, 'YYYY-MM-DD'. Null = sigue. */
  fechaSalida?: string | null;
  /** Dispensa de salario mínimo (Res. CNSS 471-02): cotiza sobre su salario real. */
  dispensaSalarioMinimo?: boolean;
  /** Dependientes adicionales del SFS vigentes en el período. */
  dependientesAdicionales?: number;
  /** Días de vacaciones al año de su ficha (si son más que los de ley). */
  vacacionesDias?: number | null;
  /**
   * Quien cobra por hora: sus horas aprobadas del período ya clasificadas. Si
   * viene, el bruto sale de aquí y no del salario mensual.
   */
  pagoPorHoras?: ResumenHoras | null;
}

/** Lo que la corrida toma de la empresa y del período, igual para todos. */
export interface AjustesCorrida {
  /** Salario mínimo del sector de la empresa: piso de la base cotizable. */
  pisoCotizableCents?: number;
  /** Tasa SRL de la empresa. Omitida = la del año. */
  srlTasa?: number;
  /** Cápita por dependiente adicional vigente en el período. */
  capitaDependienteCents?: number;
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
  salarioCotizableCents: number;
  dependientesAdicionales: number;
  dependientesAdicionalesCents: number;
  /** Días del período que se le pagan y días que tiene el período. */
  diasPagados: number;
  diasPeriodo: number;
  /** Provisión del período según su antigüedad. */
  provisionRegaliaCents: number;
  provisionVacacionesCents: number;
  provisionCesantiaCents: number;
  /** Quien cobra por hora: cómo se clasificaron sus horas. Null para los demás. */
  horasDetalle: ResumenHoras | null;
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
 * Días del rango en que estuvo contratado. Quien está de baja sin fecha de
 * salida no cobra: no hay forma de saber hasta cuándo trabajó.
 */
export function diasPagables(e: EmpleadoParaCorrida, r: Rango): number {
  if (e.estado !== 'activo' && !e.fechaSalida) return 0;
  const parte = interseccion(r, e.fechaIngreso ?? null, e.fechaSalida ?? null);
  return parte ? diasDelRango(parte) : 0;
}

interface Pedazo {
  desglose: DesgloseNomina;
  diasPagados: number;
  diasPeriodo: number;
}

/**
 * Mensual y quincenas. Se calcula el MES que le toca al empleado —cada tramo del
 * mes vale su parte del salario por los días que trabajó en él— y sobre eso se
 * aplican topes, escala del ISR y piso; después el resultado se reparte entre los
 * tramos según lo que devengó en cada uno. Así quien entra el día 20 paga el ISR
 * de lo que de verdad ganó ese mes, no un pedazo del ISR de un mes completo, y las
 * dos quincenas siguen sumando el mes al centavo.
 */
function pedazoDelMes(e: EmpleadoParaCorrida, tasas: TasasNomina, p: PeriodoCorrida, ajustes: AjustesCorrida): Pedazo | null {
  const mes = rangoDelMes(p.periodo);
  const tramos: Rango[] = p.tipo === 'mensual'
    ? [mes]
    : [{ inicio: mes.inicio, fin: `${p.periodo}-15` }, { inicio: `${p.periodo}-16`, fin: mes.fin }];
  const indice = p.tipo === 'quincenal-2' ? 1 : 0;
  const salario = Math.max(0, e.salarioBaseCents);

  const partes = tramos.map((t, k) => {
    const dias = diasDelRango(t);
    const pagados = diasPagables(e, t);
    const base = tramos.length === 1 ? salario : pedazoPeriodo(salario, k + 1, tramos.length);
    return { dias, pagados, bruto: Math.round((base * pagados) / dias) };
  });
  const propio = partes[indice];
  if (propio.pagados === 0) return null;

  const suma = (f: (x: (typeof partes)[number]) => number, hasta = partes.length) =>
    partes.slice(0, hasta).reduce((s, x) => s + f(x), 0);
  const brutoMes = suma((x) => x.bruto);
  // El mínimo es mensual: quien trabajó parte del mes cotiza sobre esa parte.
  const piso = e.dispensaSalarioMinimo ? 0 : Math.round(((ajustes.pisoCotizableCents ?? 0) * suma((x) => x.pagados)) / suma((x) => x.dias));

  const mensual = calcularNominaEmpleado({
    salarioMensualCents: brutoMes,
    tasas,
    pisoCotizableCents: piso,
    srlTasa: ajustes.srlTasa,
    dependientesAdicionales: e.dependientesAdicionales,
    capitaDependienteCents: ajustes.capitaDependienteCents,
  });

  // Se reparte por lo devengado; sin salario, por días (la cápita igual se reparte).
  const peso = (x: (typeof partes)[number]) => (brutoMes > 0 ? x.bruto : x.pagados);
  const desglose = repartirDesglose(mensual, suma(peso, indice), peso(propio), suma(peso));
  return { desglose, diasPagados: propio.pagados, diasPeriodo: propio.dias };
}

/**
 * Semanal. La semana completa vale el mes × 12 ÷ 52, repartido con redondeo
 * acumulado sobre las 52 semanas del año: las 52 suman el año exacto y cuatro
 * seguidas se desvían del mes × 48 ÷ 52 como mucho un centavo. Topes, ISR y
 * cápita se calculan sobre el mes y la semana se lleva su parte.
 */
function pedazoDeSemana(e: EmpleadoParaCorrida, tasas: TasasNomina, p: PeriodoCorrida, ajustes: AjustesCorrida): Pedazo | null {
  const dias = diasDelRango(p);
  const pagados = diasPagables(e, p);
  if (pagados === 0) return null;
  const salario = Math.max(0, e.salarioBaseCents);

  const semanaCompleta = pedazoPeriodo(salario * 12, semanaDelAnio(p.inicio), 52);
  const bruto = Math.round((semanaCompleta * pagados) / dias);

  const mensual = calcularNominaEmpleado({
    salarioMensualCents: salario,
    tasas,
    pisoCotizableCents: e.dispensaSalarioMinimo ? 0 : ajustes.pisoCotizableCents,
    srlTasa: ajustes.srlTasa,
    dependientesAdicionales: e.dependientesAdicionales,
    capitaDependienteCents: ajustes.capitaDependienteCents,
  });

  const desglose = salario > 0
    ? repartirDesglose(mensual, 0, bruto, salario)
    : repartirDesglose(mensual, 0, 12 * pagados, 52 * dias);
  return { desglose, diasPagados: pagados, diasPeriodo: dias };
}

/** Cuántas veces cabe el período en un mes: la base mensual para topes, ISR y mínimo. */
export const periodosPorMes = (tipo: TipoCorrida) => (tipo === 'mensual' ? 1 : tipo === 'semanal' ? 52 / 12 : 2);

/**
 * Quien cobra por hora. El bruto son sus horas aprobadas del período; topes, ISR
 * y piso se calculan sobre lo que ganaría en un mes a ese ritmo, y el período se
 * lleva su parte. Sin horas aprobadas no hay línea.
 */
function pedazoPorHoras(e: EmpleadoParaCorrida, tasas: TasasNomina, p: PeriodoCorrida, ajustes: AjustesCorrida): Pedazo | null {
  const h = e.pagoPorHoras;
  if (!h || h.brutoCents <= 0) return null;
  const mesEquivalente = Math.round(h.brutoCents * periodosPorMes(p.tipo));
  const mensual = calcularNominaEmpleado({
    salarioMensualCents: mesEquivalente,
    tasas,
    pisoCotizableCents: e.dispensaSalarioMinimo ? 0 : ajustes.pisoCotizableCents,
    srlTasa: ajustes.srlTasa,
    dependientesAdicionales: e.dependientesAdicionales,
    capitaDependienteCents: ajustes.capitaDependienteCents,
  });
  return {
    desglose: repartirDesglose(mensual, 0, h.brutoCents, mesEquivalente),
    diasPagados: h.dias,
    diasPeriodo: diasDelRango(p),
  };
}

/**
 * Construye la corrida de un período. Entra cada empleado con al menos un día
 * pagable en el rango: los activos y también quien salió dentro del período,
 * que cobra hasta su último día.
 */
export function construirCorrida(
  empleados: EmpleadoParaCorrida[],
  tasas: TasasNomina,
  periodo: PeriodoCorrida,
  ajustes: AjustesCorrida = {},
): CorridaCalculada {
  const lineas: LineaCalculada[] = [];
  const totales: TotalesCorrida = {
    totalBrutoCents: 0,
    totalDeduccionesCents: 0,
    totalNetoCents: 0,
    totalPatronalCents: 0,
  };

  for (const e of empleados) {
    const pedazo = e.pagoPorHoras
      ? pedazoPorHoras(e, tasas, periodo, ajustes)
      : periodo.tipo === 'semanal'
        ? pedazoDeSemana(e, tasas, periodo, ajustes)
        : pedazoDelMes(e, tasas, periodo, ajustes);
    if (!pedazo) continue;
    const d = pedazo.desglose;
    // El tope de la regalía son 5 salarios mínimos: el del sector de la empresa.
    const provision = calcularProvisionesPeriodo({
      brutoPeriodoCents: d.brutoCents,
      salarioMensualCents: e.pagoPorHoras
        ? Math.round(d.brutoCents * periodosPorMes(periodo.tipo))
        : e.salarioBaseCents,
      fechaIngreso: e.fechaIngreso ?? null,
      fechaSalida: e.fechaSalida ?? null,
      inicio: periodo.inicio,
      fin: periodo.fin,
      diasVacacionesEmpleado: e.vacacionesDias ?? null,
      topeRegaliaAnualCents: ajustes.pisoCotizableCents ? 5 * ajustes.pisoCotizableCents : null,
    });

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
      salarioCotizableCents: d.salarioCotizableCents,
      dependientesAdicionales: d.dependientesAdicionales,
      dependientesAdicionalesCents: d.dependientesAdicionalesCents,
      diasPagados: pedazo.diasPagados,
      diasPeriodo: pedazo.diasPeriodo,
      provisionRegaliaCents: provision.regaliaCents,
      provisionVacacionesCents: provision.vacacionesCents,
      provisionCesantiaCents: provision.cesantiaCents,
      horasDetalle: e.pagoPorHoras ?? null,
    });

    totales.totalBrutoCents += d.brutoCents;
    totales.totalDeduccionesCents += d.totalDeduccionesCents;
    totales.totalNetoCents += d.netoCents;
    totales.totalPatronalCents += d.totalPatronalCents;
  }

  return { lineas, totales };
}
