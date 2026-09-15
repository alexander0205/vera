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
 * CONFIRMADO 2026-08-24 contra fuentes oficiales:
 *   · AFP/SFS (empleado y patronal) e INFOTEP — cotejados con la TSS.
 *   · SMC = RD$23,223/mes y topes AFP/SFS/SRL (20/10/4 SMC) — Resolución
 *     01-2025 de la TSS, vigente desde febrero 2026.
 *   · Escala ISR — Resolución DDG-AR1-2026-00001 de la DGII; exento hasta
 *     RD$416,220/año, sin cambios desde 2018.
 *
 * ⚠️ Lo único que sigue dependiendo de la empresa: el SRL (riesgo laboral) va
 *    de 1.10% a 1.30% según el nivel de riesgo. Aquí queda el piso (1.10%); si
 *    la empresa tiene un nivel mayor, se ajusta esta tasa.
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
  /** INFOTEP (formación técnica), 1 % patronal sobre nómina ordinaria.
   * El 0.5 % del trabajador aplica únicamente a utilidades/bonificaciones y
   * se modelará con ese flujo, no como deducción del salario base. */
  infotepPatronal: number;

  // ── Topes del salario cotizable a la TSS ──
  /** Salario Mínimo Cotizable que publica la TSS, en centavos. */
  salarioMinimoCotizableCents: number;
  /** Tope del salario cotizable para AFP, en cantidad de SMC. */
  topeAfpEnSalarios: number;
  /** Tope del salario cotizable para SFS, en cantidad de SMC. */
  topeSfsEnSalarios: number;
  /** Tope del salario cotizable para SRL (riesgo laboral), en cantidad de SMC. */
  topeSrlEnSalarios: number;

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
  srlPatronal: 0.0110, // piso del rango 1.10–1.30% (por nivel de riesgo)
  infotepPatronal: 0.0100,

  // SMC RD$23,223.00/mes (Resolución 01-2025 TSS, vigente desde feb 2026).
  salarioMinimoCotizableCents: 2_322_300,
  topeAfpEnSalarios: 20, // tope AFP = RD$464,460
  topeSfsEnSalarios: 10, // tope SFS = RD$232,230
  topeSrlEnSalarios: 4,  // tope SRL = RD$92,892

  isrEscala: [
    { desdeCents:        0,      fijoCents:       0,      tasa: 0    },
    { desdeCents: 41_622_000,    fijoCents:       0,      tasa: 0.15 },
    { desdeCents: 62_432_900,    fijoCents: 3_121_600,    tasa: 0.20 },
    { desdeCents: 86_712_300,    fijoCents: 7_977_600,    tasa: 0.25 },
  ],
};

/**
 * Tasas 2027. Solo cambia la escala del ISR: la Ley 30-26 (promulgada el 18 de
 * junio de 2026, art. 10) modifica el art. 296 del Código Tributario a partir del
 * ejercicio fiscal 2027. Sube el exento a RD$480,000 y agrega un tramo del 27 %.
 * Confirmado por la DGII (Comunidad de Ayuda, respuesta CA687) y la escala
 * publicada por Alegra y Siempre al Día; los montos fijos cuadran con los tramos.
 *
 * Escala ISR (RD$ anual):
 *   0 – 480,000.00              → exento
 *   480,000.01 – 685,000.00     → 15 % del excedente de 480,000
 *   685,000.01 – 910,000.00     → 30,750.00 + 20 % del excedente de 685,000
 *   910,000.01 – 4,800,000.00   → 75,750.00 + 25 % del excedente de 910,000
 *   4,800,000.01 en adelante    → 1,048,250.00 + 27 % del excedente de 4,800,000
 *
 * ⚠️ La ley prevé ajustar la escala por inflación cada año: 2028 en adelante
 *    necesita su propia columna con los montos que publique la DGII.
 * ⚠️ AFP, SFS, SRL, INFOTEP, el SMC y sus topes quedan como en 2026 hasta que la
 *    TSS publique cambios: la Ley 30-26 no los toca.
 */
export const TASAS_NOMINA_2027: TasasNomina = {
  ...TASAS_NOMINA_2026,
  anio: 2027,
  isrEscala: [
    { desdeCents:          0,    fijoCents:           0,    tasa: 0    },
    { desdeCents: 48_000_000,    fijoCents:           0,    tasa: 0.15 },
    { desdeCents: 68_500_000,    fijoCents:   3_075_000,    tasa: 0.20 },
    { desdeCents: 91_000_000,    fijoCents:   7_575_000,    tasa: 0.25 },
    { desdeCents: 480_000_000,   fijoCents: 104_825_000,    tasa: 0.27 },
  ],
};

/** Registro de tasas por año. Al cerrar un año fiscal se agrega su columna. */
export const TASAS_POR_ANIO: Record<number, TasasNomina> = {
  2026: TASAS_NOMINA_2026,
  2027: TASAS_NOMINA_2027,
};

/**
 * Tasas del año pedido. Si ese año no está cargado, usa el más reciente anterior
 * a él (un 2028 sin columna cae a 2027, no a 2026); y si es anterior a todos, el
 * primero cargado (2025 usa 2026, que tiene la misma escala desde 2018).
 */
export function tasasDelAnio(anio: number): TasasNomina {
  if (TASAS_POR_ANIO[anio]) return TASAS_POR_ANIO[anio];
  const anios = Object.keys(TASAS_POR_ANIO).map(Number).sort((a, b) => a - b);
  const anterior = anios.filter((a) => a <= anio).pop();
  return TASAS_POR_ANIO[anterior ?? anios[0]];
}

// ─── Dependientes adicionales del SFS ─────────────────────────────────────────

export interface CapitaDependiente {
  /** Desde qué fecha rige, 'YYYY-MM-DD'. */
  vigenteDesde: string;
  /** Per cápita del Seguro Familiar de Salud, en centavos. */
  perCapitaCents: number;
  /** Aporte al Fondo Nacional de Atención Médica por Accidentes de Tránsito. */
  fonamatCents: number;
  resolucion: string;
}

/**
 * Lo que paga el trabajador al mes por CADA dependiente adicional en su seguro
 * de salud; la TSS se lo factura al empleador y este lo descuenta del salario.
 *
 * CONFIRMADO en la FAQ de la TSS (tabla «Per-cápita adicional (actualmente)»):
 * RD$1,887.54 + RD$32.24 de FONAMAT = RD$1,919.78. Resolución CNSS 624-02,
 * vigente desde el 1 de noviembre de 2025.
 *
 * Cuando el CNSS la cambie se AGREGA una fila con su fecha: las corridas viejas
 * se recalculan con el monto de su época, no con el nuevo.
 */
export const CAPITAS_DEPENDIENTE_ADICIONAL: CapitaDependiente[] = [
  { vigenteDesde: '2025-11-01', perCapitaCents: 188_754, fonamatCents: 3_224, resolucion: 'CNSS 624-02' },
];

/**
 * La cápita vigente en una fecha. Antes de la primera fila cargada devuelve esa
 * primera: las tarifas anteriores no están en el sistema.
 */
export function capitaDependienteVigente(fechaYMD: string): CapitaDependiente {
  const orden = [...CAPITAS_DEPENDIENTE_ADICIONAL].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  return [...orden].reverse().find((c) => c.vigenteDesde <= fechaYMD) ?? orden[0];
}

/** Total mensual por dependiente adicional: per cápita + FONAMAT. */
export const capitaTotalCents = (c: CapitaDependiente) => c.perCapitaCents + c.fonamatCents;

// ─── Salario mínimo del sector (piso de la base cotizable) ────────────────────

export const TAMANOS_EMPRESA = ['micro', 'pequena', 'mediana', 'grande'] as const;
export type TamanoEmpresa = (typeof TAMANOS_EMPRESA)[number];

export const LABEL_TAMANO_EMPRESA: Record<TamanoEmpresa, string> = {
  micro: 'Microempresa',
  pequena: 'Pequeña empresa',
  mediana: 'Mediana empresa',
  grande: 'Gran empresa',
};

export const esTamanoEmpresa = (v: unknown): v is TamanoEmpresa =>
  (TAMANOS_EMPRESA as readonly string[]).includes(String(v));

export interface SalarioMinimoSector {
  vigenteDesde: string;
  resolucion: string;
  montosCents: Record<TamanoEmpresa, number>;
}

/**
 * Salario mínimo del sector privado no sectorizado, por tamaño de empresa.
 *
 * Es el PISO de la base para cotizar a la TSS: sin dispensa (Res. CNSS 471-02)
 * no se reporta a nadie por debajo del mínimo de su sector, aunque gane menos
 * (manual de preguntas frecuentes de la TSS).
 *
 * Resolución CNS-01-2025, segundo tramo, vigente desde el 1 de febrero de 2026
 * (alerta fiscal de EY). El primer tramo, anterior a esa fecha, NO está cargado.
 * Hoteles, zonas francas y demás sectores tienen su propia tabla y tampoco lo
 * están: una empresa de esos sectores no debe configurar su tamaño aquí.
 */
export const SALARIOS_MINIMOS_SECTOR: SalarioMinimoSector[] = [
  {
    vigenteDesde: '2026-02-01',
    resolucion: 'CNS-01-2025',
    montosCents: { micro: 1_699_320, pequena: 1_842_120, mediana: 2_748_960, grande: 2_998_800 },
  },
];

/**
 * El mínimo del sector para un tamaño en una fecha, en centavos. Null antes de la
 * primera tabla cargada: sin el monto de esa época no se aplica piso, y la base
 * vuelve a ser el salario real, que es lo que se hacía antes de existir el piso.
 */
export function salarioMinimoSector(tamano: TamanoEmpresa, fechaYMD: string): number | null {
  const fila = [...SALARIOS_MINIMOS_SECTOR]
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
    .find((s) => s.vigenteDesde <= fechaYMD);
  return fila ? fila.montosCents[tamano] : null;
}

/** La tabla de mínimos vigente en una fecha, o null si es anterior a la primera. */
export function tablaSalarioMinimo(fechaYMD: string): SalarioMinimoSector | null {
  return [...SALARIOS_MINIMOS_SECTOR]
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
    .find((s) => s.vigenteDesde <= fechaYMD) ?? null;
}

// ─── Seguro de Riesgos Laborales por empresa ──────────────────────────────────

/**
 * Rango de la tasa SRL: 1 % fijo más una cuota variable de 0.1 % a 0.3 % según
 * la actividad y el riesgo de la empresa (preguntas frecuentes de IDOPPRIL).
 */
export const SRL_TASA_MIN = 0.011;
export const SRL_TASA_MAX = 0.013;

/** ¿Es una tasa SRL dentro del rango de ley? */
export const esTasaSrl = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= SRL_TASA_MIN - 1e-9 && v <= SRL_TASA_MAX + 1e-9;
