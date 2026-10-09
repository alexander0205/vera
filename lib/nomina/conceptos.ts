/**
 * Conceptos variables de la nómina — ingresos y descuentos por empleado.
 * Funciones puras, sin BD.
 *
 * Un INGRESO (incentivo, comisión, bono…) suma al bruto de la corrida. Si
 * «cotiza» entra a la base de la TSS y del ISR; si no, se paga tal cual (exento).
 * Un DESCUENTO (avance, préstamo, seguro médico, daños…) baja el neto y nunca lo
 * deja en negativo: lo que no alcanza a descontarse en esta corrida NO se
 * descuenta y lo avisa el resultado, para que el saldo de un préstamo no baje
 * por un monto que no se cobró.
 *
 * Los montos son POR CORRIDA: un incentivo fijo de 3,000 se paga completo en la
 * mensual y completo en cada quincena (la persona que configura lo pone ya
 * partido, como lo piensa su contable).
 */

import {
  calcularNominaEmpleado,
  type DesgloseNomina,
  type ParametrosNomina,
} from '@/lib/nomina/calculo';

export type TipoConcepto = 'ingreso' | 'descuento';

/** Un concepto listo para aplicarse a un empleado en una corrida. */
export interface ConceptoAplicable {
  /** Concepto del catálogo; null si es un descuento de préstamo sin concepto. */
  conceptoId: number | null;
  /** Préstamo que origina el descuento: al aprobar baja su saldo. */
  prestamoId?: number | null;
  tipo: TipoConcepto;
  nombre: string;
  montoCents: number;
  /** Solo ingresos: entra a la base de TSS e ISR. */
  cotizaTss: boolean;
  /** Cuenta contable propia; null = la general de sueldos / otras deducciones. */
  cuentaId?: number | null;
  comentario?: string | null;
}

/** Lo que de verdad se aplicó: el monto de un descuento puede quedar por debajo del pedido. */
export interface ConceptoAplicado extends ConceptoAplicable {
  /** Lo que se pidió; `montoCents` es lo que se aplicó. */
  pedidoCents: number;
}

/** Catálogo que se siembra a cada empresa la primera vez. */
export interface ConceptoSemilla {
  codigo: string;
  nombre: string;
  tipo: TipoConcepto;
  cotizaTss: boolean;
}

export const CONCEPTOS_SEMILLA: ConceptoSemilla[] = [
  { codigo: 'incentivo', nombre: 'Incentivo', tipo: 'ingreso', cotizaTss: true },
  { codigo: 'comision', nombre: 'Comisión', tipo: 'ingreso', cotizaTss: true },
  { codigo: 'horas-extra', nombre: 'Horas extra', tipo: 'ingreso', cotizaTss: true },
  { codigo: 'vacaciones', nombre: 'Vacaciones pagadas', tipo: 'ingreso', cotizaTss: false },
  { codigo: 'otros-ingresos', nombre: 'Otros ingresos (bono, gratificación)', tipo: 'ingreso', cotizaTss: true },
  { codigo: 'avance', nombre: 'Avance de sueldo / cuenta por cobrar', tipo: 'descuento', cotizaTss: false },
  { codigo: 'prestamo', nombre: 'Préstamo', tipo: 'descuento', cotizaTss: false },
  { codigo: 'seguro-medico', nombre: 'Seguro médico adicional', tipo: 'descuento', cotizaTss: false },
  { codigo: 'danos', nombre: 'Daños o roturas', tipo: 'descuento', cotizaTss: false },
  { codigo: 'otros-descuentos', nombre: 'Otros descuentos', tipo: 'descuento', cotizaTss: false },
];

/** Código del concepto bajo el que se asientan los descuentos de préstamos. */
export const CODIGO_PRESTAMO = 'prestamo';

/** Un concepto asignado a un empleado, tal como se guarda. */
export interface AsignacionConcepto {
  conceptoId: number;
  tipo: TipoConcepto;
  nombre: string;
  cotizaTss: boolean;
  cuentaId: number | null;
  montoCents: number;
  /** true = se repite cada corrida mientras dure; false = una sola vez. */
  fijo: boolean;
  /** 'YYYY-MM-DD'. Fijo: desde cuándo. No fijo: el día cuya corrida lo paga. */
  desde: string;
  /** Solo fijos: último día; null = sin fin. */
  hasta: string | null;
  comentario: string | null;
}

/**
 * ¿Entra esta asignación en la corrida que paga `inicio`–`fin`? Fija: si su
 * vigencia se traslapa con las fechas. No fija: si su día cae dentro de ellas.
 */
export function aplicaEnCorrida(a: Pick<AsignacionConcepto, 'fijo' | 'desde' | 'hasta'>, inicio: string, fin: string): boolean {
  if (!a.fijo) return a.desde >= inicio && a.desde <= fin;
  return a.desde <= fin && (a.hasta === null || a.hasta >= inicio);
}

export function aConceptoAplicable(a: AsignacionConcepto): ConceptoAplicable {
  return {
    conceptoId: a.conceptoId,
    tipo: a.tipo,
    nombre: a.nombre,
    montoCents: Math.max(0, Math.round(a.montoCents)),
    cotizaTss: a.tipo === 'ingreso' && a.cotizaTss,
    cuentaId: a.cuentaId,
    comentario: a.comentario,
  };
}

/** Un préstamo activo y lo que toca descontar de él en una corrida. */
export interface PrestamoDescontable {
  id: number;
  saldoCents: number;
  cuotaCents: number;
  comentario?: string | null;
}

/** La cuota del préstamo en esta corrida: la cuota, o lo que quede si es menos. */
export function cuotaPrestamo(p: PrestamoDescontable): number {
  return Math.max(0, Math.min(Math.round(p.cuotaCents), Math.round(p.saldoCents)));
}

export interface ResultadoConceptos {
  desglose: DesgloseNomina;
  aplicados: ConceptoAplicado[];
  /** Descuentos que no cupieron (por encima del neto), para avisar. */
  noAplicadoCents: number;
}

/**
 * Suma los conceptos al desglose de UN empleado en UNA corrida.
 *
 * `base` es el desglose del período (ya repartido) y `mensual` los parámetros del
 * cálculo mensual de donde salió. Lo que cotiza se mide como la DIFERENCIA entre
 * calcular el mes con y sin ese ingreso: así topes de la TSS y escala del ISR
 * responden al ingreso real, y el aumento cae entero en esta corrida (no se
 * reparte entre quincenas como el salario).
 */
export function aplicarConceptos(
  base: DesgloseNomina,
  mensual: ParametrosNomina,
  conceptos: ConceptoAplicable[],
): ResultadoConceptos {
  if (conceptos.length === 0) return { desglose: base, aplicados: [], noAplicadoCents: 0 };

  const ingresos = conceptos.filter((c) => c.tipo === 'ingreso' && c.montoCents > 0);
  const descuentos = conceptos.filter((c) => c.tipo === 'descuento' && c.montoCents > 0);
  const cotizable = ingresos.filter((c) => c.cotizaTss).reduce((s, c) => s + c.montoCents, 0);
  const exento = ingresos.filter((c) => !c.cotizaTss).reduce((s, c) => s + c.montoCents, 0);

  let d: DesgloseNomina = { ...base };

  if (cotizable > 0) {
    const sin = calcularNominaEmpleado(mensual);
    const con = calcularNominaEmpleado({ ...mensual, salarioMensualCents: mensual.salarioMensualCents + cotizable });
    d = {
      ...d,
      afpEmpleadoCents: d.afpEmpleadoCents + (con.afpEmpleadoCents - sin.afpEmpleadoCents),
      sfsEmpleadoCents: d.sfsEmpleadoCents + (con.sfsEmpleadoCents - sin.sfsEmpleadoCents),
      isrCents: d.isrCents + (con.isrCents - sin.isrCents),
      afpPatronalCents: d.afpPatronalCents + (con.afpPatronalCents - sin.afpPatronalCents),
      sfsPatronalCents: d.sfsPatronalCents + (con.sfsPatronalCents - sin.sfsPatronalCents),
      srlPatronalCents: d.srlPatronalCents + (con.srlPatronalCents - sin.srlPatronalCents),
      infotepPatronalCents: d.infotepPatronalCents + (con.infotepPatronalCents - sin.infotepPatronalCents),
      salarioCotizableCents: d.salarioCotizableCents + (con.salarioCotizableCents - sin.salarioCotizableCents),
      baseIsrMensualCents: d.baseIsrMensualCents + (con.baseIsrMensualCents - sin.baseIsrMensualCents),
    };
  }
  d.brutoCents += cotizable + exento;

  const deduccionesLey = d.afpEmpleadoCents + d.sfsEmpleadoCents + d.isrCents + d.dependientesAdicionalesCents;
  let disponible = Math.max(0, d.brutoCents - deduccionesLey - d.otrasDeduccionesCents);
  const aplicados: ConceptoAplicado[] = ingresos.map((c) => ({ ...c, pedidoCents: c.montoCents }));
  let noAplicado = 0;
  let otras = d.otrasDeduccionesCents;
  for (const c of descuentos) {
    const monto = Math.min(c.montoCents, disponible);
    disponible -= monto;
    otras += monto;
    noAplicado += c.montoCents - monto;
    aplicados.push({ ...c, montoCents: monto, pedidoCents: c.montoCents });
  }

  d.otrasDeduccionesCents = otras;
  d.totalDeduccionesCents = deduccionesLey + otras;
  d.totalPatronalCents = d.afpPatronalCents + d.sfsPatronalCents + d.srlPatronalCents + d.infotepPatronalCents;
  d.netoCents = d.brutoCents - d.totalDeduccionesCents;

  return { desglose: d, aplicados, noAplicadoCents: noAplicado };
}

// ─── Validación de lo que escribe una persona ────────────────────────────────

/** Tope de un monto por corrida o de un préstamo: 100 millones de pesos. */
export const MONTO_MAX_CENTS = 10_000_000_000;
/** Un préstamo no puede necesitar más cuotas que estas (unos 20 años quincenales). */
export const CUOTAS_MAX = 520;
/** Conceptos y préstamos activos por empleado; más que esto es casi seguro un error. */
export const MAX_ACTIVOS_POR_EMPLEADO = 50;

export type MontoParseado = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Pesos escritos por una persona → centavos enteros. Solo número o texto; el
 * texto admite coma de miles («1,500.00») pero no coma decimal («12,50» es
 * ambiguo) ni más de dos decimales (0.001 no es un monto). Positivo y con tope.
 */
export function parseMontoPesos(v: unknown, nombre = 'El monto'): MontoParseado {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.trim().replace(/^RD\$\s*/i, '');
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) {
      return { ok: false, error: /\.\d{3,}$/.test(t) ? `${nombre} no puede tener más de dos decimales` : `${nombre} no es un número válido` };
    }
    n = Number(t.replace(/,/g, ''));
  } else return { ok: false, error: `${nombre} no es un número válido` };

  if (!Number.isFinite(n)) return { ok: false, error: `${nombre} no es un número válido` };
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) return { ok: false, error: `${nombre} no puede tener más de dos decimales` };
  if (cents <= 0) return { ok: false, error: `${nombre} debe ser mayor que cero` };
  if (cents > MONTO_MAX_CENTS) return { ok: false, error: `${nombre} no puede pasar de RD$100,000,000` };
  return { ok: true, cents };
}

/** Texto libre de una persona: sin caracteres de control (el NUL rompe la base), recortado. */
export function limpiarTexto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t === '' ? null : t;
}

/** Una fecha 'YYYY-MM-DD' real y razonable (2000–2100): 9999-12-31 es casi seguro un error. */
export function fechaRazonable(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  if (a < 2000 || a > 2100) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Cuántas cuotas necesita un préstamo. */
export const cuotasDePrestamo = (montoCents: number, cuotaCents: number) =>
  cuotaCents > 0 ? Math.ceil(montoCents / cuotaCents) : Infinity;
