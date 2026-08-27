/**
 * Obligaciones al Estado de una corrida — función pura, sin BD.
 *
 * De una corrida aprobada nacen dos obligaciones que se pagan APARTE del sueldo
 * del empleado y DESPUÉS: a la TSS (AFP+SFS+SRL+INFOTEP, parte del empleado y
 * patronal) y a la DGII (ISR retenido). Cada una guarda su desglose para poder
 * saldar el pasivo correcto en contabilidad al pagarla.
 */

export type DestinoObligacion = 'TSS' | 'DGII';

/** Lo mínimo de una línea para calcular las obligaciones. */
export interface LineaObligacion {
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  isrCents: number;
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
}

export interface Obligacion {
  destino: DestinoObligacion;
  montoCents: number;
  /** Parte retenida al empleado (salda "retenciones por pagar"). */
  parteRetencionesCents: number;
  /** Parte patronal (salda "aportes por pagar"). */
  parteAportesCents: number;
}

/**
 * Obligaciones de una corrida a partir de sus líneas. Devuelve solo las que
 * tienen monto (> 0). TSS agrupa AFP+SFS (empleado y patronal) + SRL + INFOTEP;
 * DGII es el ISR retenido.
 */
export function obligacionesDeLineas(lineas: LineaObligacion[]): Obligacion[] {
  let tssRet = 0; // AFP+SFS empleado
  let tssApo = 0; // AFP+SFS patronal + SRL + INFOTEP
  let dgiiRet = 0; // ISR

  for (const l of lineas) {
    tssRet += l.afpEmpleadoCents + l.sfsEmpleadoCents;
    tssApo += l.afpPatronalCents + l.sfsPatronalCents + l.srlPatronalCents + l.infotepPatronalCents;
    dgiiRet += l.isrCents;
  }

  const out: Obligacion[] = [];
  const tssTotal = tssRet + tssApo;
  if (tssTotal > 0) {
    out.push({ destino: 'TSS', montoCents: tssTotal, parteRetencionesCents: tssRet, parteAportesCents: tssApo });
  }
  if (dgiiRet > 0) {
    out.push({ destino: 'DGII', montoCents: dgiiRet, parteRetencionesCents: dgiiRet, parteAportesCents: 0 });
  }
  return out;
}

export const LABEL_DESTINO: Record<DestinoObligacion, string> = {
  TSS: 'TSS (Seguridad Social)',
  DGII: 'DGII (ISR retenido)',
};
