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
}

const sinCeros = (lineas: LineaAsiento[]) => lineas.filter((l) => l.debeCents > 0 || l.haberCents > 0);

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
  return sinCeros([
    { cuentaId: c.gastoSueldos, debeCents: s.brutoCents, haberCents: 0, descripcion: 'Sueldos del período' },
    { cuentaId: c.gastoAportes, debeCents: s.aportesTssCents + s.infotepCents, haberCents: 0, descripcion: 'Aportes patronales (TSS e INFOTEP)' },
    { cuentaId: c.retencionTss, debeCents: 0, haberCents: s.retencionTssCents, descripcion: 'Retenciones TSS por pagar (AFP, SFS, dependientes)' },
    { cuentaId: c.isr, debeCents: 0, haberCents: s.isrCents, descripcion: 'ISR de asalariados por pagar (DGII)' },
    { cuentaId: c.otrasDeducciones, debeCents: 0, haberCents: s.otrasDeduccionesCents, descripcion: 'Otras deducciones por pagar' },
    { cuentaId: c.aportesTss, debeCents: 0, haberCents: s.aportesTssCents, descripcion: 'Aportes patronales TSS por pagar' },
    { cuentaId: c.infotep, debeCents: 0, haberCents: s.infotepCents, descripcion: 'INFOTEP por pagar' },
    { cuentaId: c.sueldosPorPagar, debeCents: 0, haberCents: s.netoCents, descripcion: 'Sueldos por pagar' },
  ]);
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
}

/**
 * Pago a la TSS: DEBE retenciones TSS, aportes TSS e INFOTEP · HABER caja o banco.
 * Pago a la DGII: DEBE ISR por pagar · HABER caja o banco.
 */
export function lineasPagoObligacion(
  o: PagoObligacion,
  c: Pick<CuentasNomina, 'retencionTss' | 'isr' | 'aportesTss' | 'infotep'> & { salida: number },
): LineaAsiento[] {
  if (o.destino === 'DGII') {
    return sinCeros([
      { cuentaId: c.isr, debeCents: o.montoCents, haberCents: 0, descripcion: 'ISR de asalariados pagado a la DGII' },
      { cuentaId: c.salida, debeCents: 0, haberCents: o.montoCents, descripcion: 'Salida de fondos (DGII)' },
    ]);
  }
  const infotep = Math.min(Math.max(0, o.infotepCents), o.aportesCents);
  return sinCeros([
    { cuentaId: c.retencionTss, debeCents: o.retencionesCents, haberCents: 0, descripcion: 'Retenciones pagadas a la TSS' },
    { cuentaId: c.aportesTss, debeCents: o.aportesCents - infotep, haberCents: 0, descripcion: 'Aportes patronales pagados a la TSS' },
    { cuentaId: c.infotep, debeCents: infotep, haberCents: 0, descripcion: 'INFOTEP pagado' },
    { cuentaId: c.salida, debeCents: 0, haberCents: o.montoCents, descripcion: 'Salida de fondos (TSS)' },
  ]);
}

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
