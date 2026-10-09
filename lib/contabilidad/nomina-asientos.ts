/**
 * Partidas de los asientos de nómina — funciones puras, sin BD.
 *
 * `asientos.ts` lee la base y resuelve las cuentas; aquí se arma la partida doble
 * con los montos y las cuentas ya resueltos. Separado para poder probar el cuadre
 * y a qué cuenta va cada peso sin montar una base.
 *
 * Por qué se separan las cuentas: lo que se retiene y se aporta se le paga a
 * entidades distintas —el neto al empleado, AFP/SFS/SRL a la TSS, el ISR a la
 * DGII y el INFOTEP (que también cobra la TSS)—, y cada pasivo tiene que quedar
 * en cero cuando se paga lo suyo.
 */

import type { LineaAsiento } from './asientos';

/** Totales de una corrida, sumados de sus líneas. */
export interface SumasCorrida {
  brutoCents: number;
  netoCents: number;
  /** AFP + SFS del empleado + cápita de dependientes adicionales. */
  retencionTssCents: number;
  isrCents: number;
  otrasDeduccionesCents: number;
  /** AFP + SFS + SRL patronales. */
  aportesTssCents: number;
  infotepCents: number;
  /** El desglose, para mandar cada concepto a su cuenta. Falta → todo junto. */
  detalle?: DetalleTss;
  /**
   * Ingresos y descuentos variables que tienen cuenta PROPIA. Los que no la
   * tienen no se listan: siguen dentro de `brutoCents` (sueldos) y de
   * `otrasDeduccionesCents` (otras deducciones por pagar).
   */
  conceptos?: ConceptoAsiento[];
}

export interface ConceptoAsiento {
  cuentaId: number;
  tipo: 'ingreso' | 'descuento';
  montoCents: number;
  nombre: string;
}

/**
 * Lo mismo de arriba, abierto por concepto de la TSS. La nómina ya lo calcula
 * así; antes se sumaba antes de asentar y el mayor quedaba con un solo número
 * que había que repartir a mano contra la factura de la TSS.
 */
export interface DetalleTss {
  sfsPatronalCents: number;
  afpPatronalCents: number;
  srlPatronalCents: number;
  /** SFS del empleado más la cápita de sus dependientes adicionales. */
  sfsEmpleadoCents: number;
  afpEmpleadoCents: number;
}

export interface CuentasNomina {
  gastoSueldos: number;
  gastoAportes: number;
  retencionTss: number;
  isr: number;
  otrasDeducciones: number;
  aportesTss: number;
  infotep: number;
  sueldosPorPagar: number;
  /** Cuentas por concepto. Vacías → `gastoAportes` y `retencionTss`. */
  gastoAporteSfs?: number | null;
  gastoAporteAfp?: number | null;
  gastoAporteSrl?: number | null;
  gastoAporteInfotep?: number | null;
  retencionSfs?: number | null;
  retencionAfp?: number | null;
}

const sinCeros = (lineas: LineaAsiento[]) => lineas.filter((l) => l.debeCents > 0 || l.haberCents > 0);

/**
 * Junta las líneas que caen en la misma cuenta y lado. Sin cuentas por concepto
 * configuradas, los cuatro aportes vuelven a ser una sola línea, igual que
 * antes de poder separarlos; con ellas configuradas, cada una queda sola.
 * La descripción de una línea fusionada es la general.
 */
function fusionar(lineas: LineaAsiento[], general: string): LineaAsiento[] {
  const porCuenta = new Map<string, { linea: LineaAsiento; conceptos: number }>();
  for (const l of lineas) {
    const clave = `${l.cuentaId}·${l.debeCents > 0 ? 'D' : 'H'}`;
    const previo = porCuenta.get(clave);
    if (!previo) {
      porCuenta.set(clave, { linea: { ...l }, conceptos: 1 });
      continue;
    }
    previo.linea.debeCents += l.debeCents;
    previo.linea.haberCents += l.haberCents;
    previo.linea.descripcion = general;
    previo.conceptos += 1;
  }
  return [...porCuenta.values()].map((x) => x.linea);
}

/**
 * Devengo al aprobar la corrida:
 *
 *   DEBE  Sueldos y salarios           bruto
 *   DEBE  Aportes patronales           AFP + SFS + SRL + INFOTEP patronales
 *   HABER Retenciones TSS por pagar    AFP + SFS del empleado + dependientes
 *   HABER ISR de asalariados por pagar ISR
 *   HABER Otras deducciones por pagar  préstamos, avances…
 *   HABER Aportes TSS por pagar        AFP + SFS + SRL patronales
 *   HABER INFOTEP por pagar            INFOTEP
 *   HABER Sueldos por pagar            neto
 *
 * Cuadra porque bruto = neto + deducciones.
 */
export function lineasDevengoNomina(s: SumasCorrida, c: CuentasNomina): LineaAsiento[] {
  const propios = (tipo: ConceptoAsiento['tipo']) => (s.conceptos ?? []).filter((x) => x.tipo === tipo && x.montoCents > 0);
  const ingresos = propios('ingreso');
  const descuentos = propios('descuento');
  const sumaIngresos = ingresos.reduce((t, x) => t + x.montoCents, 0);
  const sumaDescuentos = descuentos.reduce((t, x) => t + x.montoCents, 0);
  return sinCeros([
    { cuentaId: c.gastoSueldos, debeCents: s.brutoCents - sumaIngresos, haberCents: 0, descripcion: 'Sueldos del período' },
    ...ingresos.map((x) => ({ cuentaId: x.cuentaId, debeCents: x.montoCents, haberCents: 0, descripcion: x.nombre })),
    ...gastoDeAportes(s, c),
    ...retencionesDelEmpleado(s, c),
    { cuentaId: c.isr, debeCents: 0, haberCents: s.isrCents, descripcion: 'ISR de asalariados por pagar (DGII)' },
    { cuentaId: c.otrasDeducciones, debeCents: 0, haberCents: s.otrasDeduccionesCents - sumaDescuentos, descripcion: 'Otras deducciones por pagar' },
    ...descuentos.map((x) => ({ cuentaId: x.cuentaId, debeCents: 0, haberCents: x.montoCents, descripcion: x.nombre })),
    { cuentaId: c.aportesTss, debeCents: 0, haberCents: s.aportesTssCents, descripcion: 'Aportes patronales TSS por pagar' },
    { cuentaId: c.infotep, debeCents: 0, haberCents: s.infotepCents, descripcion: 'INFOTEP por pagar' },
    { cuentaId: c.sueldosPorPagar, debeCents: 0, haberCents: s.netoCents, descripcion: 'Sueldos por pagar' },
  ]);
}

/**
 * Devengo de una corrida de REGALÍA pascual:
 *
 *   DEBE  Regalía por pagar (la reserva)   lo que ya se había provisionado, hasta el bruto
 *   DEBE  Gasto de regalía                 lo que falta: el bruto menos la reserva usada
 *   HABER ISR de asalariados por pagar     el ISR de lo gravado
 *   HABER Sueldos por pagar                el neto
 *
 * La regalía no lleva TSS ni aportes patronales. Si no hay reserva (la empresa no
 * provisiona, o ya se gastó), todo va al gasto.
 */
export function lineasDevengoRegalia(
  s: { brutoCents: number; reservaCents: number; isrCents: number; netoCents: number },
  c: { gastoRegalia: number; regaliaPorPagar: number | null; isr: number; sueldosPorPagar: number },
): LineaAsiento[] {
  const reserva = c.regaliaPorPagar === null ? 0 : Math.max(0, Math.min(s.reservaCents, s.brutoCents));
  return sinCeros([
    { cuentaId: c.regaliaPorPagar ?? c.gastoRegalia, debeCents: reserva, haberCents: 0, descripcion: 'Regalía pascual: se usa la reserva acumulada' },
    { cuentaId: c.gastoRegalia, debeCents: s.brutoCents - reserva, haberCents: 0, descripcion: 'Regalía pascual (gasto no provisionado)' },
    { cuentaId: c.isr, debeCents: 0, haberCents: s.isrCents, descripcion: 'ISR de la regalía por pagar (DGII)' },
    { cuentaId: c.sueldosPorPagar, debeCents: 0, haberCents: s.netoCents, descripcion: 'Regalía por pagar a los empleados' },
  ]);
}

const GASTO_APORTES = 'Aportes patronales (TSS e INFOTEP)';
const RETENCION_TSS = 'Retenciones TSS por pagar (AFP, SFS, dependientes)';

/**
 * El Debe de lo que aporta la empresa. Con el desglose y las cuentas por
 * concepto, una línea por cada uno: SFS, AFP, riesgos laborales e INFOTEP.
 * Sin ellos, una sola línea por el total, como siempre.
 *
 * El reparto sale del detalle, pero el total manda: lo que no cuadre con
 * `aportesTssCents` (redondeos de la nómina) se queda en la línea del SFS, para
 * que el asiento no descuadre nunca por un peso.
 */
function gastoDeAportes(s: SumasCorrida, c: CuentasNomina): LineaAsiento[] {
  const d = s.detalle;
  if (!d) {
    return [{ cuentaId: c.gastoAportes, debeCents: s.aportesTssCents + s.infotepCents, haberCents: 0, descripcion: GASTO_APORTES }];
  }
  const afp = Math.max(0, d.afpPatronalCents);
  const srl = Math.max(0, d.srlPatronalCents);
  const sfs = s.aportesTssCents - afp - srl;
  return fusionar([
    { cuentaId: c.gastoAporteSfs ?? c.gastoAportes, debeCents: sfs, haberCents: 0, descripcion: 'Aporte patronal SFS' },
    { cuentaId: c.gastoAporteAfp ?? c.gastoAportes, debeCents: afp, haberCents: 0, descripcion: 'Aporte patronal AFP' },
    { cuentaId: c.gastoAporteSrl ?? c.gastoAportes, debeCents: srl, haberCents: 0, descripcion: 'Aporte patronal riesgos laborales' },
    { cuentaId: c.gastoAporteInfotep ?? c.gastoAportes, debeCents: s.infotepCents, haberCents: 0, descripcion: 'Aporte patronal INFOTEP' },
  ], GASTO_APORTES);
}

/** El Haber de lo que se le retiene al empleado: SFS (con dependientes) y AFP. */
function retencionesDelEmpleado(s: SumasCorrida, c: CuentasNomina): LineaAsiento[] {
  const d = s.detalle;
  if (!d) {
    return [{ cuentaId: c.retencionTss, debeCents: 0, haberCents: s.retencionTssCents, descripcion: RETENCION_TSS }];
  }
  const afp = Math.max(0, d.afpEmpleadoCents);
  const sfs = s.retencionTssCents - afp;
  return fusionar([
    { cuentaId: c.retencionSfs ?? c.retencionTss, debeCents: 0, haberCents: sfs, descripcion: 'Retención SFS del empleado (con dependientes)' },
    { cuentaId: c.retencionAfp ?? c.retencionTss, debeCents: 0, haberCents: afp, descripcion: 'Retención AFP del empleado' },
  ], RETENCION_TSS);
}

/** Lo que salda el pago de una obligación. */
export interface PagoObligacion {
  destino: 'TSS' | 'DGII';
  montoCents: number;
  /** TSS: retenciones del empleado. DGII: el ISR. */
  retencionesCents: number;
  /** TSS: aportes patronales + INFOTEP. DGII: 0. */
  aportesCents: number;
  /** La parte de INFOTEP que va dentro de los aportes de la TSS. */
  infotepCents: number;
  /** De lo retenido, cuánto es AFP del empleado; el resto es SFS. Falta → todo junto. */
  retencionAfpCents?: number;
}

/**
 * Pago a la TSS: DEBE retenciones TSS, aportes TSS e INFOTEP · HABER caja o banco.
 * Pago a la DGII: DEBE ISR por pagar · HABER caja o banco.
 */
export function lineasPagoObligacion(
  o: PagoObligacion,
  c: Pick<CuentasNomina, 'retencionTss' | 'isr' | 'aportesTss' | 'infotep' | 'retencionSfs' | 'retencionAfp'> & { salida: number },
): LineaAsiento[] {
  if (o.destino === 'DGII') {
    return sinCeros([
      { cuentaId: c.isr, debeCents: o.montoCents, haberCents: 0, descripcion: 'ISR de asalariados pagado a la DGII' },
      { cuentaId: c.salida, debeCents: 0, haberCents: o.montoCents, descripcion: 'Salida de fondos (DGII)' },
    ]);
  }
  const infotep = Math.min(Math.max(0, o.infotepCents), o.aportesCents);
  // El pasivo se salda por donde se creó: si las retenciones entraron separadas
  // en SFS y AFP, el pago las baja igual de separadas o esas cuentas no cerrarían.
  const afp = Math.min(Math.max(0, o.retencionAfpCents ?? 0), o.retencionesCents);
  const retenciones = o.retencionAfpCents === undefined
    ? [{ cuentaId: c.retencionTss, debeCents: o.retencionesCents, haberCents: 0, descripcion: PAGO_RETENCIONES }]
    : fusionar([
        { cuentaId: c.retencionSfs ?? c.retencionTss, debeCents: o.retencionesCents - afp, haberCents: 0, descripcion: 'Retención SFS pagada a la TSS' },
        { cuentaId: c.retencionAfp ?? c.retencionTss, debeCents: afp, haberCents: 0, descripcion: 'Retención AFP pagada a la TSS' },
      ], PAGO_RETENCIONES);
  return sinCeros([
    ...retenciones,
    { cuentaId: c.aportesTss, debeCents: o.aportesCents - infotep, haberCents: 0, descripcion: 'Aportes patronales pagados a la TSS' },
    { cuentaId: c.infotep, debeCents: infotep, haberCents: 0, descripcion: 'INFOTEP pagado' },
    { cuentaId: c.salida, debeCents: 0, haberCents: o.montoCents, descripcion: 'Salida de fondos (TSS)' },
  ]);
}

const PAGO_RETENCIONES = 'Retenciones pagadas a la TSS';

/** Pago del neto a los empleados: DEBE sueldos por pagar · HABER caja o banco. */
export function lineasPagoSueldos(montoCents: number, c: { sueldosPorPagar: number; salida: number }): LineaAsiento[] {
  return sinCeros([
    { cuentaId: c.sueldosPorPagar, debeCents: montoCents, haberCents: 0, descripcion: 'Sueldos pagados' },
    { cuentaId: c.salida, debeCents: 0, haberCents: montoCents, descripcion: 'Salida de fondos (nómina)' },
  ]);
}

export interface CuentasProvision {
  regaliaGasto: number;
  regaliaPasivo: number;
  vacacionesGasto: number;
  vacacionesPasivo: number;
  cesantiaGasto: number;
  cesantiaPasivo: number;
}

/** Provisión: cada derecho con su gasto y su pasivo. */
export function lineasProvisionNomina(
  p: { regaliaCents: number; vacacionesCents: number; cesantiaCents: number },
  c: CuentasProvision,
): LineaAsiento[] {
  return sinCeros([
    { cuentaId: c.regaliaGasto, debeCents: p.regaliaCents, haberCents: 0, descripcion: 'Provisión regalía pascual' },
    { cuentaId: c.vacacionesGasto, debeCents: p.vacacionesCents, haberCents: 0, descripcion: 'Provisión vacaciones' },
    { cuentaId: c.cesantiaGasto, debeCents: p.cesantiaCents, haberCents: 0, descripcion: 'Provisión cesantía' },
    { cuentaId: c.regaliaPasivo, debeCents: 0, haberCents: p.regaliaCents, descripcion: 'Regalía pascual por pagar' },
    { cuentaId: c.vacacionesPasivo, debeCents: 0, haberCents: p.vacacionesCents, descripcion: 'Vacaciones por pagar' },
    { cuentaId: c.cesantiaPasivo, debeCents: 0, haberCents: p.cesantiaCents, descripcion: 'Cesantía provisionada' },
  ]);
}
