/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FUENTE DE VERDAD — Tasas de nómina (RD)                          ║
 * ║                                                                  ║
 * ║  Todo lo que la ley fija para calcular una nómina dominicana:    ║
 * ║  aportes a la Seguridad Social (TSS) y la escala del ISR.        ║
 * ║  El motor (lib/nomina/calculo.ts) NO trae ningún número quemado: ║
 * ║  los lee de aquí. Cambia una tasa = una línea, y el sistema      ║
 * ║  entero la respeta.                                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ PENDIENTE DE CONFIRMAR contra TSS y DGII vigentes (2026):
 *   · Los porcentajes de AFP/SFS/INFOTEP son estables desde hace años, pero
 *     el SRL (riesgo laboral) varía por empresa y el Salario Mínimo Cotizable
 *     (SMC) lo actualiza la TSS.
 *   · La escala del ISR está congelada desde 2017 (no indexada), pero hay que
 *     verificar que no la hayan ajustado antes de usarla en producción.
 *   Ninguno de estos números debe darse por bueno sin cotejarlo: calcula el
 *   sueldo real de una persona.
 */

/** Un tramo de la escala anual del ISR. */
export interface TramoISR {
  /** Piso del tramo, en centavos de renta anual gravable. */
  desdeCents: number;
  /** Impuesto fijo acumulado de los tramos anteriores, en centavos. */
  fijoCents: number;
  /** Tasa marginal aplicada al excedente sobre `desdeCents`. */
  tasa: number;
}

export interface TasasNomina {
  anio: number;

  // ── Seguridad Social — porciones del EMPLEADO (se descuentan del sueldo) ──
  /** AFP (fondo de pensiones), porción del empleado. */
  afpEmpleado: number;
  /** SFS/SDSS (seguro de salud), porción del empleado. */
  sfsEmpleado: number;

  // ── Seguridad Social — aportes PATRONALES (los paga la empresa aparte) ──
  afpPatronal: number;
  sfsPatronal: number;
  /** Seguro de Riesgos Laborales (SRL). Varía por empresa; este es el piso. */
  srlPatronal: number;
  /** INFOTEP (formación técnica). */
  infotepPatronal: number;

  // ── Topes del salario cotizable a la TSS ──
  /** Salario Mínimo Cotizable que publica la TSS, en centavos. */
  salarioMinimoCotizableCents: number;
  /** Tope del salario cotizable para AFP, en cantidad de SMC. */
  topeAfpEnSalarios: number;
  /** Tope del salario cotizable para SFS, en cantidad de SMC. */
  topeSfsEnSalarios: number;

  /** Escala anual del ISR, ordenada de menor a mayor por `desdeCents`. */
  isrEscala: TramoISR[];
}

/**
 * Tasas 2026 (valores por defecto). Porcentajes en fracción (0.0287 = 2,87 %).
 * La escala del ISR va en centavos: los montos oficiales son en RD$ anuales,
 * aquí ×100.
 *
 * Escala ISR (RD$ anual):
 *   0 – 416,220.00           → exento
 *   416,220.01 – 624,329.00  → 15 % del excedente de 416,220
 *   624,329.01 – 867,123.00  → 31,216.00 + 20 % del excedente de 624,329
 *   867,123.01 en adelante   → 79,776.00 + 25 % del excedente de 867,123
 */
export const TASAS_NOMINA_2026: TasasNomina = {
  anio: 2026,

  afpEmpleado: 0.0287,
  sfsEmpleado: 0.0304,

  afpPatronal: 0.0710,
  sfsPatronal: 0.0709,
  srlPatronal: 0.0115,
  infotepPatronal: 0.0100,

  // SMC pendiente de confirmar con la TSS; placeholder para no bloquear el motor.
  salarioMinimoCotizableCents: 0,
  topeAfpEnSalarios: 20,
  topeSfsEnSalarios: 10,

  isrEscala: [
    { desdeCents:        0,      fijoCents:       0,      tasa: 0    },
    { desdeCents: 41_622_000,    fijoCents:       0,      tasa: 0.15 },
    { desdeCents: 62_432_900,    fijoCents: 3_121_600,    tasa: 0.20 },
    { desdeCents: 86_712_300,    fijoCents: 7_977_600,    tasa: 0.25 },
  ],
};

/** Registro de tasas por año. Al cerrar un año fiscal se agrega su columna. */
export const TASAS_POR_ANIO: Record<number, TasasNomina> = {
  2026: TASAS_NOMINA_2026,
};

/** Tasas del año pedido; cae al más reciente si ese año aún no está cargado. */
export function tasasDelAnio(anio: number): TasasNomina {
  return TASAS_POR_ANIO[anio] ?? TASAS_NOMINA_2026;
}
