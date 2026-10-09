/**
 * Compras y gastos — reglas fiscales dominicanas, puras (sin BD).
 *
 * Una compra es un comprobante que te emite un proveedor (B01, E31…) o uno que
 * te emites tú porque el proveedor no puede (compras a informales, gastos
 * menores, pagos al exterior). De ese comprobante salen tres cosas a la vez:
 *
 *   - la línea del Formato 606 (Norma General 07-2018), que se envía antes del
 *     día 15 del mes siguiente;
 *   - el ITBIS que se puede adelantar en el IT-1 y el que se lleva al costo;
 *   - las retenciones que la empresa hace al pagar (ITBIS e ISR) y que después
 *     declara y paga ella (IT-1 e IR-17).
 *
 * Todo en centavos. Las fechas son 'YYYY-MM-DD' en hora dominicana.
 */

// ─── Catálogos del Formato 606 ───────────────────────────────────────────────

/** Campo 3 del 606: tipo de bienes y servicios comprados. */
export const TIPOS_BIENES_606 = {
  '01': 'Gastos de personal',
  '02': 'Gastos por trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos que forman parte del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
} as const;
export type TipoBienes606 = keyof typeof TIPOS_BIENES_606;
export const esTipoBienes606 = (v: unknown): v is TipoBienes606 =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIPOS_BIENES_606, v);

/** Campo 17 del 606: tipo de retención en ISR. */
export const TIPOS_RETENCION_ISR = {
  1: 'Alquileres',
  2: 'Honorarios por servicios independientes',
  3: 'Otras rentas',
  4: 'Otras rentas (rentas presuntas)',
  5: 'Intereses pagados a personas jurídicas residentes',
  6: 'Intereses pagados a personas físicas residentes',
  7: 'Retención por proveedores del Estado',
  8: 'Juegos telefónicos de premios',
} as const;
export type TipoRetencionIsr = keyof typeof TIPOS_RETENCION_ISR;
export const esTipoRetencionIsr = (v: unknown): v is TipoRetencionIsr =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8;

/** Campo 23 del 606: forma de pago. */
export const FORMAS_PAGO_606 = {
  '1': 'Efectivo',
  '2': 'Cheques, transferencias o depósitos',
  '3': 'Tarjeta de crédito o débito',
  '4': 'Compra a crédito',
  '5': 'Permuta',
  '6': 'Notas de crédito',
  '7': 'Mixto',
} as const;
export type FormaPago606 = keyof typeof FORMAS_PAGO_606;

/** Métodos con los que se registra el pago de una compra. */
export const METODOS_PAGO_COMPRA = ['efectivo', 'transferencia', 'cheque', 'tarjeta', 'deposito'] as const;
export type MetodoPagoCompra = (typeof METODOS_PAGO_COMPRA)[number];

export function formaPago606(formaPago: string, metodo: string | null | undefined): FormaPago606 {
  if (formaPago === 'credito') return '4';
  switch (metodo) {
    case 'efectivo': return '1';
    case 'tarjeta': return '3';
    case 'permuta': return '5';
    case 'nota_credito': return '6';
    case 'mixto': return '7';
    default: return '2'; // transferencia, cheque, depósito y los antiguos «otro»
  }
}

// ─── RNC y cédula ────────────────────────────────────────────────────────────

export interface Identificacion {
  limpio: string;
  /** Campo 2 del 606: 1 = RNC, 2 = cédula. */
  tipoId: '1' | '2' | null;
  persona: 'juridica' | 'fisica' | null;
  /** 9 dígitos (RNC) u 11 (cédula). */
  formatoValido: boolean;
  /** Dígito verificador. Hay cédulas viejas válidas que no lo cumplen: solo avisa. */
  digitoOk: boolean;
}

function digitoRnc(ocho: string): number {
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ocho[i]), 0);
  const resto = suma % 11;
  if (resto === 0) return 2;
  if (resto === 1) return 1;
  return 11 - resto;
}

function digitoCedula(diez: string): number {
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    const p = Number(diez[i]) * (i % 2 === 0 ? 1 : 2);
    suma += p > 9 ? p - 9 : p;
  }
  return (10 - (suma % 10)) % 10;
}

export function analizarIdentificacion(texto: string | null | undefined): Identificacion {
  const limpio = String(texto ?? '').replace(/\D/g, '');
  if (limpio.length === 9) {
    return { limpio, tipoId: '1', persona: 'juridica', formatoValido: true, digitoOk: digitoRnc(limpio.slice(0, 8)) === Number(limpio[8]) };
  }
  if (limpio.length === 11) {
    return { limpio, tipoId: '2', persona: 'fisica', formatoValido: true, digitoOk: digitoCedula(limpio.slice(0, 10)) === Number(limpio[10]) };
  }
  return { limpio, tipoId: null, persona: null, formatoValido: false, digitoOk: false };
}

// ─── NCF ─────────────────────────────────────────────────────────────────────

type OrigenNcf = 'proveedor' | 'autoemitido' | 'no-aplica';

interface ReglaNcf {
  nombre: string;
  origen: OrigenNcf;
  /** Si el ITBIS facturado puede adelantarse (sustenta crédito fiscal). */
  credito: boolean;
  reporta606: boolean;
  nota?: boolean;
}

/** Por tipo de comprobante; la serie E usa los mismos con otro número. */
const REGLAS_NCF: Record<string, ReglaNcf> = {
  '01': { nombre: 'Crédito fiscal', origen: 'proveedor', credito: true, reporta606: true },
  // El de consumo no sustenta costos ni gastos ni da crédito: no va al 606.
  '02': { nombre: 'Consumo', origen: 'proveedor', credito: false, reporta606: false },
  '03': { nombre: 'Nota de débito', origen: 'proveedor', credito: true, reporta606: true, nota: true },
  '04': { nombre: 'Nota de crédito', origen: 'proveedor', credito: true, reporta606: true, nota: true },
  '11': { nombre: 'Comprobante de compras', origen: 'autoemitido', credito: true, reporta606: true },
  '12': { nombre: 'Registro único de ingresos', origen: 'no-aplica', credito: false, reporta606: false },
  // Gastos menores: emitido a nombre de la propia empresa, el ITBIS no se adelanta.
  '13': { nombre: 'Gastos menores', origen: 'autoemitido', credito: false, reporta606: true },
  '14': { nombre: 'Regímenes especiales', origen: 'proveedor', credito: true, reporta606: true },
  '15': { nombre: 'Gubernamental', origen: 'proveedor', credito: true, reporta606: true },
  '16': { nombre: 'Exportaciones', origen: 'no-aplica', credito: false, reporta606: false },
  '17': { nombre: 'Pagos al exterior', origen: 'autoemitido', credito: false, reporta606: true },
};

/** La serie E (e-CF) numera distinto: 31 es el 01, 41 el 11, 47 el 17. */
const E_A_B: Record<string, string> = {
  '31': '01', '32': '02', '33': '03', '34': '04', '41': '11', '43': '13',
  '44': '14', '45': '15', '46': '16', '47': '17',
};

export interface InfoNcf {
  ncf: string;
  valido: boolean;
  error: string | null;
  serie: 'B' | 'E' | null;
  /** Tipo tal como viene: '01' en B01, '31' en E31. */
  tipo: string | null;
  /** El tipo equivalente en la serie B, para las reglas: E31 → '01'. */
  tipoBase: string | null;
  electronico: boolean;
  nombre: string;
  origen: OrigenNcf | null;
  daCreditoItbis: boolean;
  reporta606: boolean;
  esNota: boolean;
}

const NCF_VACIO: Omit<InfoNcf, 'ncf' | 'error'> = {
  valido: false, serie: null, tipo: null, tipoBase: null, electronico: false, nombre: '',
  origen: null, daCreditoItbis: false, reporta606: false, esNota: false,
};

export function analizarNcf(texto: string | null | undefined): InfoNcf {
  const ncf = String(texto ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!ncf) return { ...NCF_VACIO, ncf, error: 'Escribe el NCF del comprobante' };

  const b = /^B(\d{2})(\d{8})$/.exec(ncf);
  const e = /^E(\d{2})(\d{10})$/.exec(ncf);
  if (!b && !e) {
    return {
      ...NCF_VACIO, ncf,
      error: ncf.startsWith('E')
        ? 'Un e-NCF tiene 13 caracteres: E + tipo (2) + secuencia (10), por ejemplo E310000000123'
        : 'Un NCF tiene 11 caracteres: B + tipo (2) + secuencia (8), por ejemplo B0100000123',
    };
  }
  const serie = b ? 'B' : 'E';
  const tipo = (b ?? e)![1];
  const tipoBase = serie === 'B' ? tipo : E_A_B[tipo] ?? null;
  const regla = tipoBase ? REGLAS_NCF[tipoBase] : undefined;
  if (!regla) {
    return { ...NCF_VACIO, ncf, serie, tipo, electronico: serie === 'E', error: `No existe el tipo de comprobante ${serie}${tipo}` };
  }
  if (regla.origen === 'no-aplica') {
    return {
      ...NCF_VACIO, ncf, serie, tipo, tipoBase, electronico: serie === 'E', nombre: regla.nombre, origen: regla.origen,
      error: `Un comprobante de ${regla.nombre.toLowerCase()} no sustenta compras`,
    };
  }
  return {
    ncf, valido: true, error: null, serie, tipo, tipoBase, electronico: serie === 'E',
    nombre: regla.nombre, origen: regla.origen, daCreditoItbis: regla.credito,
    reporta606: regla.reporta606, esNota: !!regla.nota,
  };
}

// ─── Líneas y totales ────────────────────────────────────────────────────────

export const TASAS_ITBIS = ['0.18', '0.16', '0', 'exento'] as const;
export type TasaItbis = (typeof TASAS_ITBIS)[number];
export const esTasaItbis = (v: unknown): v is TasaItbis => (TASAS_ITBIS as readonly unknown[]).includes(v);

export interface LineaCompra {
  cantidad: number;
  costoUnitarioCents: number;
  itbisTasa: TasaItbis;
  esServicio: boolean;
}

export interface TotalesLineas {
  baseServiciosCents: number;
  baseBienesCents: number;
  baseCents: number;
  itbisCents: number;
  /** ITBIS de las líneas de servicios: sobre él se aplica la retención del 30 %. */
  itbisServiciosCents: number;
  lineas: { baseCents: number; itbisCents: number }[];
}

export function totalizarLineas(lineas: LineaCompra[]): TotalesLineas {
  const t: TotalesLineas = { baseServiciosCents: 0, baseBienesCents: 0, baseCents: 0, itbisCents: 0, itbisServiciosCents: 0, lineas: [] };
  for (const l of lineas) {
    const baseCents = Math.round(l.cantidad * l.costoUnitarioCents);
    const tasa = l.itbisTasa === 'exento' ? 0 : Number(l.itbisTasa);
    const itbisCents = Math.round(baseCents * tasa);
    t.lineas.push({ baseCents, itbisCents });
    t.baseCents += baseCents;
    t.itbisCents += itbisCents;
    if (l.esServicio) {
      t.baseServiciosCents += baseCents;
      t.itbisServiciosCents += itbisCents;
    } else {
      t.baseBienesCents += baseCents;
    }
  }
  return t;
}

/**
 * Cuánto ITBIS no se puede adelantar y se suma al costo o al gasto: todo el de
 * un comprobante que no da crédito (consumo, gastos menores, pagos al
 * exterior) y todo el de una empresa que no cobra ITBIS en sus ventas.
 */
export function itbisAlCostoPorDefecto(p: { ncf: InfoNcf; regimenItbis: string | null | undefined; itbisCents: number }): number {
  if (p.itbisCents <= 0) return 0;
  if (!p.ncf.daCreditoItbis) return p.itbisCents;
  if (p.regimenItbis && p.regimenItbis !== 'gravado') return p.itbisCents;
  return 0;
}

// ─── Retenciones ─────────────────────────────────────────────────────────────

/** Desde esta fecha de pago rigen las tasas de la Ley 30-26 (art. 17; Aviso DGII 10-26). */
export const CAMBIO_RETENCIONES_LEY_30_26 = '2026-07-01';

export interface TasasRetencion {
  /** Honorarios y servicios independientes de personas físicas. */
  honorariosPF: number;
  /** Alquileres pagados a personas físicas (pago único y definitivo). */
  alquilerPF: number;
  /** Servicios técnicos de personas físicas: la tasa sobre una renta presunta del 20 %. */
  tecnicosPF: number;
  /** Rentas pagadas a no residentes. */
  exterior: number;
}

export function tasasRetencion(fechaPago: string): TasasRetencion {
  const ley3026 = fechaPago >= CAMBIO_RETENCIONES_LEY_30_26;
  return {
    honorariosPF: ley3026 ? 0.15 : 0.10,
    alquilerPF: ley3026 ? 0.15 : 0.10,
    tecnicosPF: ley3026 ? 0.03 : 0.02,
    exterior: 0.27,
  };
}

export const TIPOS_PROVEEDOR = ['juridica', 'fisica', 'informal', 'rst', 'exterior'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

export const CONCEPTOS_RETENCION = [
  'bienes', 'servicios_profesionales', 'servicios_tecnicos', 'alquiler', 'seguridad', 'otros_servicios',
] as const;
export type ConceptoRetencion = (typeof CONCEPTOS_RETENCION)[number];

export interface RetencionSugerida {
  itbisRetenidoCents: number;
  isrRetenidoCents: number;
  isrTipo: TipoRetencionIsr | null;
  /** Por qué, en palabras, con la base legal. Vacío si no aplica ninguna. */
  motivos: string[];
}

const pct = (t: number) => `${Math.round(t * 1000) / 10} %`;

/**
 * Lo que la ley manda retener. Es una sugerencia: el contador puede ajustarla
 * (por ejemplo, un proveedor con constancia de exención).
 */
export function sugerirRetenciones(p: {
  tipoProveedor: TipoProveedor;
  concepto: ConceptoRetencion;
  fecha: string;
  baseServiciosCents: number;
  baseBienesCents: number;
  itbisCents: number;
  itbisServiciosCents: number;
}): RetencionSugerida {
  const r: RetencionSugerida = { itbisRetenidoCents: 0, isrRetenidoCents: 0, isrTipo: null, motivos: [] };
  const tasas = tasasRetencion(p.fecha);
  const esPersona = p.tipoProveedor === 'fisica' || p.tipoProveedor === 'informal';

  // ITBIS
  if ((esPersona || p.tipoProveedor === 'rst') && p.itbisCents > 0) {
    r.itbisRetenidoCents = p.itbisCents;
    r.motivos.push(p.tipoProveedor === 'rst'
      ? '100 % del ITBIS: el proveedor está en el Régimen Simplificado de Tributación'
      : '100 % del ITBIS: compra a una persona física (Norma General 02-05)');
  } else if (p.tipoProveedor === 'juridica' && p.itbisServiciosCents > 0) {
    if (p.concepto === 'servicios_profesionales') {
      r.itbisRetenidoCents = Math.round(p.itbisServiciosCents * 0.30);
      r.motivos.push('30 % del ITBIS: servicios profesionales entre empresas (Norma General 02-05)');
    } else if (p.concepto === 'seguridad') {
      r.itbisRetenidoCents = p.itbisServiciosCents;
      r.motivos.push('100 % del ITBIS: servicios de seguridad y vigilancia (Norma General 07-09)');
    }
  }

  // ISR
  if (esPersona && p.baseServiciosCents > 0) {
    const ley = p.fecha >= CAMBIO_RETENCIONES_LEY_30_26 ? ' desde el 1-jul-2026 (Ley 30-26, art. 17)' : ' (art. 309 del Código Tributario)';
    if (p.concepto === 'servicios_profesionales') {
      r.isrRetenidoCents = Math.round(p.baseServiciosCents * tasas.honorariosPF);
      r.isrTipo = 2;
      r.motivos.push(`ISR ${pct(tasas.honorariosPF)} de honorarios a persona física${ley}`);
    } else if (p.concepto === 'alquiler') {
      r.isrRetenidoCents = Math.round(p.baseServiciosCents * tasas.alquilerPF);
      r.isrTipo = 1;
      r.motivos.push(`ISR ${pct(tasas.alquilerPF)} de alquiler a persona física${ley}`);
    } else if (p.concepto !== 'bienes') {
      r.isrRetenidoCents = Math.round(p.baseServiciosCents * tasas.tecnicosPF);
      r.isrTipo = 4;
      r.motivos.push(`ISR ${pct(tasas.tecnicosPF)} de servicios técnicos a persona física (renta presunta, Norma General 07-07)${ley}`);
    }
  } else if (p.tipoProveedor === 'exterior') {
    const base = p.baseServiciosCents + p.baseBienesCents;
    if (base > 0) {
      r.isrRetenidoCents = Math.round(base * tasas.exterior);
      r.isrTipo = 3;
      r.motivos.push(`ISR ${pct(tasas.exterior)} de pagos a no residentes (art. 305 del Código Tributario)`);
    }
  }
  return r;
}

// ─── Resumen del comprobante ─────────────────────────────────────────────────

export interface ImpuestosCompra {
  itbisFacturadoCents: number;
  itbisAlCostoCents: number;
  itbisRetenidoCents: number;
  isrRetenidoCents: number;
  iscCents: number;
  otrosImpuestosCents: number;
  propinaCents: number;
}

export interface ResumenCompra {
  /** Lo que factura el proveedor: base + ITBIS + ISC + otros + propina. */
  totalCents: number;
  retencionesCents: number;
  /** Lo que de verdad se le paga: el total menos lo retenido. */
  netoAPagarCents: number;
  /** Campo 15 del 606: el ITBIS que se adelanta en el IT-1. */
  itbisPorAdelantarCents: number;
}

export function resumirCompra(baseCents: number, imp: ImpuestosCompra): ResumenCompra {
  const totalCents = baseCents + imp.itbisFacturadoCents + imp.iscCents + imp.otrosImpuestosCents + imp.propinaCents;
  const retencionesCents = imp.itbisRetenidoCents + imp.isrRetenidoCents;
  return {
    totalCents,
    retencionesCents,
    netoAPagarCents: totalCents - retencionesCents,
    itbisPorAdelantarCents: Math.max(0, imp.itbisFacturadoCents - imp.itbisAlCostoCents),
  };
}

/** Lo que no cuadra en un comprobante; vacío si está bien. */
export function erroresCompra(p: { baseCents: number; imp: ImpuestosCompra; formaPago: string; fechaPago: string | null }): string[] {
  const e: string[] = [];
  const { imp } = p;
  const valores = [imp.itbisFacturadoCents, imp.itbisAlCostoCents, imp.itbisRetenidoCents, imp.isrRetenidoCents, imp.iscCents, imp.otrosImpuestosCents, imp.propinaCents];
  if (valores.some((v) => !Number.isSafeInteger(v) || v < 0)) e.push('Los impuestos no pueden ser negativos');
  if (p.baseCents <= 0) e.push('El comprobante no tiene monto');
  if (imp.itbisAlCostoCents > imp.itbisFacturadoCents) e.push('El ITBIS llevado al costo no puede pasar del ITBIS facturado');
  if (imp.itbisRetenidoCents > imp.itbisFacturadoCents) e.push('No se puede retener más ITBIS del facturado');
  if (imp.isrRetenidoCents > p.baseCents) e.push('La retención de ISR no puede pasar del monto sin impuestos');
  if ((imp.itbisRetenidoCents > 0 || imp.isrRetenidoCents > 0) && p.formaPago === 'contado' && !p.fechaPago) {
    e.push('Con retenciones hace falta la fecha de pago: el 606 la exige');
  }
  return e;
}

// ─── Formato 606 ─────────────────────────────────────────────────────────────

export interface CompraPara606 {
  rncProveedor: string | null;
  ncf: string;
  ncfModificado: string | null;
  tipoBienes: string;
  fechaComprobante: string;
  fechaPago: string | null;
  montoServiciosCents: number;
  montoBienesCents: number;
  itbisFacturadoCents: number;
  itbisRetenidoCents: number;
  itbisProporcionalidadCents: number;
  itbisAlCostoCents: number;
  isrTipo: number | null;
  isrRetenidoCents: number;
  iscCents: number;
  otrosImpuestosCents: number;
  propinaCents: number;
  formaPago: FormaPago606;
}

const monto = (c: number) => (c / 100).toFixed(2);
const opcional = (c: number) => (c > 0 ? monto(c) : '');
const fecha606 = (f: string | null) => (f ? f.replace(/-/g, '') : '');

/**
 * Los 23 campos de una línea del 606, separados por «|».
 *
 * - Gastos menores (13): el RNC es el de la propia empresa, que los emite a su nombre.
 * - Retenciones sin fecha de pago: la DGII exige la fecha cuando hay retención, y
 *   la retención nace al pagar. Hasta entonces se reporta sin ellas.
 */
export function lineaFormato606(c: CompraPara606, rncEmpresa: string): string {
  const info = analizarNcf(c.ncf);
  const rnc = info.tipoBase === '13' ? rncEmpresa.replace(/\D/g, '') : (c.rncProveedor ?? '').replace(/\D/g, '');
  const tipoId = rnc.length === 11 ? '2' : '1';
  const pagada = !!c.fechaPago;
  const itbisRetenido = pagada ? c.itbisRetenidoCents : 0;
  const isrRetenido = pagada ? c.isrRetenidoCents : 0;
  const porAdelantar = Math.max(0, c.itbisFacturadoCents - c.itbisProporcionalidadCents - c.itbisAlCostoCents);
  return [
    rnc,                                         // 1  RNC o cédula
    tipoId,                                      // 2  tipo de identificación
    c.tipoBienes,                                // 3  tipo de bienes y servicios
    c.ncf,                                       // 4  NCF
    c.ncfModificado ?? '',                       // 5  NCF modificado
    fecha606(c.fechaComprobante),                // 6  fecha del comprobante
    fecha606(c.fechaPago),                       // 7  fecha de pago
    monto(c.montoServiciosCents),                // 8  monto en servicios
    monto(c.montoBienesCents),                   // 9  monto en bienes
    monto(c.montoServiciosCents + c.montoBienesCents), // 10 total facturado
    monto(c.itbisFacturadoCents),                // 11 ITBIS facturado
    opcional(itbisRetenido),                     // 12 ITBIS retenido
    opcional(c.itbisProporcionalidadCents),      // 13 ITBIS sujeto a proporcionalidad
    opcional(c.itbisAlCostoCents),               // 14 ITBIS llevado al costo
    monto(porAdelantar),                         // 15 ITBIS por adelantar
    '',                                          // 16 ITBIS percibido
    isrRetenido > 0 && c.isrTipo ? String(c.isrTipo) : '', // 17 tipo de retención ISR
    opcional(isrRetenido),                       // 18 monto retención renta
    '',                                          // 19 ISR percibido
    opcional(c.iscCents),                        // 20 ISC
    opcional(c.otrosImpuestosCents),             // 21 otros impuestos
    opcional(c.propinaCents),                    // 22 propina legal
    c.formaPago,                                 // 23 forma de pago
  ].join('|');
}
