/**
 * Convierte el payload interno de emitedo al DTO que espera ecf-api.
 * ecf-api firma, asigna NCF y envía a DGII — emitedo ya no lo hace directamente.
 *
 * Cada tipo de e-CF tiene su propio DTO en ecf-api (EmitirEcf31Dto, etc.).
 * Este mapper traduce el modelo genérico de emitedo al DTO correcto por tipo.
 */

import { type EcfTotales } from '@/lib/ecf/types';

// ─── Tipos internos de emitedo ────────────────────────────────────────────────

export interface EmitedoItem {
  nombreItem: string;
  descripcionItem?: string;
  cantidadItem: number;
  unidadMedidaItem?: string;
  precioUnitarioItem: number;
  descuentoMonto?: number;
  tasaItbis?: 0.18 | 0.16 | 0;
  indicadorBienoServicio?: 1 | 2;
  /** Tipo 41: monto explícito de ITBIS retenido para este item (overrides 100%) */
  montoITBISRetenido?: number;
  /** Tipo 41/47: monto explícito de ISR retenido para este item */
  montoISRRetenido?: number;
}

/**
 * Retención agregada a nivel de comprobante (tipos 31/32/33/34).
 * Estructura: { id, nombre, porcentaje, tipo: 'itbis'|'isr'|'otro', monto }.
 */
export interface EmitedoRetencion {
  id?: string;
  nombre?: string;
  porcentaje?: number;
  tipo: 'itbis' | 'isr' | 'otro';
  monto: number;
}

export interface EmitedoEmisionData {
  tipoEcf: string;
  items: EmitedoItem[];
  totales: EcfTotales;
  /** Para tipo 41: se traduce a rncProveedor. Para tipo 47: ignorado (comprador es extranjero). */
  rncComprador?: string;
  /** Para tipo 41: se traduce a razonSocialProveedor. Para tipo 47: se traduce a razonSocialProveedor. */
  razonSocialComprador?: string;
  emailComprador?: string;
  tipoPago: number;
  fechaLimitePago?: string;
  ncfModificado?: string;
  codigoModificacion?: number;
  /**
   * Tipo de ingresos (DGII catálogo codigos_ingreso) — siempre string de 2 dígitos:
   *   "01"=Operaciones (Habituales) — default
   *   "02"=Financieros
   *   "03"=Extraordinarios
   *   "04"=Arrendamientos
   *   "05"=Venta Activos depreciables
   *   "06"=Otros Ingresos
   * Aplica a tipos 31, 32, 44, 45, 46. Oculto en 33, 34, 41, 43, 47.
   * Acepta number o string en input — el mapper lo normaliza al formato XSD ("01"…"06").
   */
  tipoIngresos?: number | string;
  /** Retenciones a nivel de comprobante (tipos 31/32/33/34). */
  retenciones?: EmitedoRetencion[];
  /**
   * Fecha de emisión del NCF que se modifica (tipos 33 y 34). Formato YYYY-MM-DD o dd-MM-yyyy.
   * OBLIGATORIO en InformacionReferencia según XSD DGII.
   * Si se omite, se usa la fecha del día actual (correcto para notas emitidas el mismo día).
   */
  fechaNcfModificado?: string;
  encfOverride?: string;
  /**
   * Fecha de vencimiento de la secuencia del NCF en formato YYYY-MM-DD o dd-MM-yyyy.
   * OBLIGATORIO para tipos 41 y 43 según XSD DGII.
   * Si se omite, se usa 31-12-(año actual + 2) como valor por defecto para pruebas.
   */
  fechaVencimientoSecuencia?: string;
  /**
   * Solo para pruebas de habilitación DGII.
   * Indica a ecf-api que omita la validación de rango del e-NCF.
   * Permite usar cualquier e-NCF sin tener un rango registrado activo.
   */
  skipRangeValidation?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza tipoIngresos al formato XSD DGII: string de 2 dígitos zero-padded ("01"…"06").
 * Acepta number (1..6) o string ("1", "01", etc.). Default "01".
 */
function formatTipoIngresos(v?: number | string): string {
  if (v === undefined || v === null) return '01';
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  if (!Number.isFinite(n) || n < 1 || n > 6) return '01';
  return String(n).padStart(2, '0');
}

/**
 * Suma retenciones por tipo y devuelve `{ itbis, isr, otro }` totales en DOP.
 * Vacío si no hay retenciones.
 */
function sumRetenciones(retenciones?: EmitedoRetencion[]): { itbis: number; isr: number; otro: number } {
  const acc = { itbis: 0, isr: 0, otro: 0 };
  if (!retenciones) return acc;
  for (const r of retenciones) {
    if (r.tipo === 'itbis') acc.itbis += r.monto;
    else if (r.tipo === 'isr') acc.isr += r.monto;
    else acc.otro += r.monto;
  }
  return acc;
}

function tasaToIndicador(tasa?: number): number {
  if (tasa === 0.18) return 1;
  if (tasa === 0.16) return 2;
  if (tasa === 0)    return 3;
  return 4; // exento
}

function mapTipoPago(tp: number): 1 | 2 | 3 {
  if (tp === 1) return 1;
  if (tp === 2) return 2;
  return 3; // 3=gratuito, 4=uso propio → gratuito
}

// YYYY-MM-DD → dd-MM-yyyy (formato ecf-api)
function toddMMyyyy(iso: string): string {
  const [y, m, day] = iso.split('-');
  return `${day}-${m}-${y}`;
}

/** Fecha de hoy en dd-MM-yyyy */
function todayDdMmYyyy(): string {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${now.getFullYear()}`;
}

/**
 * Normaliza cualquier fecha a dd-MM-yyyy.
 * Acepta YYYY-MM-DD o dd-MM-yyyy.
 * Si se omite, devuelve la fecha de hoy.
 */
function normalizeDate(f?: string): string {
  if (!f) return todayDdMmYyyy();
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return toddMMyyyy(f);
  return f; // ya está en dd-MM-yyyy
}

/**
 * Normaliza fecha a dd-MM-yyyy para ecf-api.
 * Acepta YYYY-MM-DD o dd-MM-yyyy.
 * Si no se provee, usa 31-12-(año actual + 2) para pruebas.
 */
/**
 * Calcula indicadorNotaCredito para tipo 34:
 *   0 = nota emitida dentro de los 30 días calendario de la factura original.
 *   1 = nota emitida después de los 30 días.
 * Acepta YYYY-MM-DD o dd-MM-yyyy. Si no se provee la fecha original, retorna 0 (default seguro).
 */
function computeIndicadorNotaCredito(fechaNcfModificado?: string): 0 | 1 {
  if (!fechaNcfModificado) return 0;
  let iso = fechaNcfModificado;
  if (/^\d{2}-\d{2}-\d{4}$/.test(fechaNcfModificado)) {
    const [dd, mm, yyyy] = fechaNcfModificado.split('-');
    iso = `${yyyy}-${mm}-${dd}`;
  }
  const original = new Date(iso);
  if (Number.isNaN(original.getTime())) return 0;
  const now = new Date();
  const days = Math.floor((now.getTime() - original.getTime()) / (1000 * 60 * 60 * 24));
  return days > 30 ? 1 : 0;
}

function normalizeFechaVenc(f?: string): string {
  if (!f) {
    const year = new Date().getFullYear() + 2;
    return `31-12-${year}`;
  }
  // YYYY-MM-DD → dd-MM-yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return toddMMyyyy(f);
  return f; // ya está en dd-MM-yyyy
}

/**
 * formasPago: requerido cuando tipoPago=1 (Contado) para la mayoría de tipos.
 * Usa formaPago=1 (Efectivo) con el monto total.
 */
function buildFormasPago(tipoPago: 1 | 2 | 3, montoTotal: number) {
  if (tipoPago !== 1) return undefined;
  return [{ formaPago: 1, montoPago: montoTotal }];
}

/** Campos de totales ITBIS comunes a varios tipos */
function totalesItbis(t: EcfTotales) {
  return {
    totalITBIS1:       t.itbis1  || undefined,
    totalITBIS2:       t.itbis2  || undefined,
    montoGravadoTotal: t.montoGravadoTotal || undefined,
    montoExento:       t.montoExento || undefined,
  };
}

// ─── Mappers de items por tipo ────────────────────────────────────────────────

/** Items genéricos para tipos 31, 32, 33, 34, 44, 45, 46 */
function mapItemsGeneric(items: EmitedoItem[]) {
  return items.map(item => ({
    indicadorFacturacion:   tasaToIndicador(item.tasaItbis),
    nombreItem:             item.nombreItem,
    indicadorBienoServicio: item.indicadorBienoServicio ?? 1,
    cantidadItem:           item.cantidadItem,
    precioUnitarioItem:     item.precioUnitarioItem,
    montoItem:              item.cantidadItem * item.precioUnitarioItem - (item.descuentoMonto ?? 0),
    descripcionItem:        item.descripcionItem,
    descuentoMonto:         item.descuentoMonto,
  }));
}

/**
 * Items tipo 41 (Comprobante de Compras): requieren bloque `retencion`.
 * El campo retencion.indicadorAgenteRetencionoPercepcion es OBLIGATORIO según XSD.
 * 1=Retención (el comprador retiene impuesto al proveedor).
 */
function mapItems41(items: EmitedoItem[]) {
  return items.map(item => {
    const montoItem = item.cantidadItem * item.precioUnitarioItem - (item.descuentoMonto ?? 0);
    const tasa      = item.tasaItbis ?? 0.18; // tipo 41 default 18%
    // Si el caller pasa montoITBISRetenido explícito (% personalizado), úsalo.
    // Si no, fallback al 100% del ITBIS calculado del item (comportamiento legacy).
    const itbisRet  = item.montoITBISRetenido !== undefined
      ? item.montoITBISRetenido
      : Math.round(montoItem * tasa * 100) / 100;
    const isrRet    = item.montoISRRetenido ?? 0;
    return {
      indicadorFacturacion:   tasaToIndicador(item.tasaItbis),
      nombreItem:             item.nombreItem,
      indicadorBienoServicio: item.indicadorBienoServicio ?? 1,
      cantidadItem:           item.cantidadItem,
      precioUnitarioItem:     item.precioUnitarioItem,
      montoItem,
      descripcionItem:        item.descripcionItem,
      descuentoMonto:         item.descuentoMonto,
      retencion: {
        indicadorAgenteRetencionoPercepcion: 1, // 1=Retención
        // DGII cod=260/272: ambos campos obligatorios en tipo 41
        montoITBISRetenido: itbisRet,
        montoISRRetenido:   isrRet,
      },
    };
  });
}

/**
 * Items tipo 43 (Gastos Menores) y tipo 44 (Regímenes Especiales).
 * DGII cod=244: solo permiten indicadorFacturacion=4 (Exento).
 * Forzamos 4 independientemente de la tasa enviada por el usuario.
 */
function mapItems43(items: EmitedoItem[]) {
  return items.map(item => ({
    indicadorFacturacion:   4 as const, // 4=Exento — único valor válido en tipos 43 y 44
    nombreItem:             item.nombreItem,
    indicadorBienoServicio: item.indicadorBienoServicio ?? 1,
    cantidadItem:           item.cantidadItem,
    precioUnitarioItem:     item.precioUnitarioItem,
    montoItem:              item.cantidadItem * item.precioUnitarioItem - (item.descuentoMonto ?? 0),
    descripcionItem:        item.descripcionItem,
  }));
}

/**
 * Items tipo 47 (Pagos al Exterior):
 * Requieren indicadorAgenteRetencionoPercepcion y montoISRRetenido (top-level en el item).
 * montoISRRetenido puede ser 0 si no hay retención adicional.
 */
function mapItems47(items: EmitedoItem[]) {
  return items.map(item => {
    const montoItem = item.cantidadItem * item.precioUnitarioItem - (item.descuentoMonto ?? 0);
    return {
      indicadorFacturacion:                4, // Exento en pagos al exterior
      nombreItem:                          item.nombreItem,
      indicadorBienoServicio:              item.indicadorBienoServicio ?? 2, // Servicio por defecto en tipo 47
      cantidadItem:                        item.cantidadItem,
      precioUnitarioItem:                  item.precioUnitarioItem,
      montoItem,
      descripcionItem:                     item.descripcionItem,
      indicadorAgenteRetencionoPercepcion: 1, // 1=Retención
      // DGII: montoISRRetenido = 27% del monto (tasa de retención ISR pagos al exterior)
      montoISRRetenido:                    Math.round(montoItem * 0.27 * 100) / 100,
    };
  });
}

function buildInformacionReferencia(d: EmitedoEmisionData) {
  if (!d.ncfModificado) return undefined;
  if (d.codigoModificacion === undefined || d.codigoModificacion === null) {
    throw new Error(
      'codigoModificacion es obligatorio cuando ncfModificado está presente (tipos 33, 34). '
      + 'Valores: 1=Anula NCF, 2=Corrige texto, 3=Corrige monto, 4=Reemplazo en contingencia, 5=Referencia a Factura de Consumo.',
    );
  }
  if (!d.fechaNcfModificado) {
    throw new Error(
      'fechaNcfModificado es obligatorio cuando ncfModificado está presente (tipos 33, 34).',
    );
  }
  return {
    ncfModificado:       d.ncfModificado,
    codigoModificacion:  Number(d.codigoModificacion),
    // OBLIGATORIO según XSD DGII — fecha original del NCF que se modifica
    fechaNCFModificado:  normalizeDate(d.fechaNcfModificado),
  };
}

// ─── Mapper principal ─────────────────────────────────────────────────────────

export function mapToEcfApiDto(d: EmitedoEmisionData): {
  tipo: string;
  esRfce: boolean;
  dto: Record<string, unknown>;
} {
  const tipo      = d.tipoEcf;
  const tipoPago  = mapTipoPago(d.tipoPago);
  const fechaLimitePago = d.fechaLimitePago ? toddMMyyyy(d.fechaLimitePago) : undefined;
  // skipRangeValidation: solo para pruebas — omitir si no se pasa
  const skipRange = d.skipRangeValidation ? { skipRangeValidation: true } : {};

  // ─── rfce32: Resumen Factura de Consumo (<250K) ─────────────────────────────
  const esRfce = tipo === '32' && d.totales.montoTotal < 250_000;

  if (esRfce) {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    const ret = sumRetenciones(d.retenciones);
    return {
      tipo,
      esRfce: true,
      dto: {
        // Endpoint unificado: requiere tipoComprobante + formato.
        tipoComprobante: tipo,
        formato:         'RFCE',
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:      d.totales.montoTotal,
        totalITBIS1:     d.totales.itbis1  || undefined,
        totalITBIS2:     d.totales.itbis2  || undefined,
        // RFCE32 usa montoGravadoI1/I2/I3 — montoGravadoTotal no existe en este DTO
        montoGravadoI1:  d.totales.montoGravadoTotal || undefined,
        montoExento:     d.totales.montoExento || undefined,
        tipoIngresos:    formatTipoIngresos(d.tipoIngresos),
        correoComprador: d.emailComprador,
        rncComprador:    d.rncComprador,
        eNcf:            d.encfOverride,
        ...(ret.itbis > 0 ? { totalITBISRetenido: Math.round(ret.itbis * 100) / 100 } : {}),
        ...(ret.isr   > 0 ? { totalISRRetencion:  Math.round(ret.isr   * 100) / 100 } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipo 41 — Comprobante de Compras ──────────────────────────────────────
  // Campos distintos: usa rncProveedor/razonSocialProveedor (no rncComprador).
  // Requiere fechaVencimientoSecuencia y retencion en cada item.
  if (tipo === '41') {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    const items41 = mapItems41(d.items);
    // DGII cod=11160/11170: totalITBISRetenido y totalISRRetencion deben ser la suma exacta de los items
    const totalITBISRet = items41.reduce((s, it) => s + (it.retencion?.montoITBISRetenido ?? 0), 0);
    const totalISRRet   = items41.reduce((s, it) => s + (it.retencion?.montoISRRetenido ?? 0), 0);
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:           tipo,
        items:                     items41,
        rncProveedor:              d.rncComprador,
        razonSocialProveedor:      d.razonSocialComprador,
        fechaVencimientoSecuencia: normalizeFechaVenc(d.fechaVencimientoSecuencia),
        indicadorMontoGravado:     0,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:                d.totales.montoTotal,
        totalITBIS1:               d.totales.itbis1  || undefined,
        totalITBIS2:               d.totales.itbis2  || undefined,
        totalITBISRetenido:        Math.round(totalITBISRet * 100) / 100,
        totalISRRetencion:         Math.round(totalISRRet   * 100) / 100,
        montoExento:               d.totales.montoExento || undefined,
        correoProveedor:           d.emailComprador,
        eNcf:                      d.encfOverride,
        ...(fechaLimitePago ? { fechaLimitePago } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipo 43 — Gastos Menores ──────────────────────────────────────────────
  // Sin formasPago (no está en el DTO según spec).
  // Requiere fechaVencimientoSecuencia.
  if (tipo === '43') {
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:           tipo,
        items:                     mapItems43(d.items),
        montoTotal:                d.totales.montoTotal,
        fechaVencimientoSecuencia: normalizeFechaVenc(d.fechaVencimientoSecuencia),
        tipoPago,
        // Todos los items de tipo 43 son exentos → montoExento = montoTotal
        montoExento:               d.totales.montoTotal,
        eNcf:                      d.encfOverride,
        ...skipRange,
      },
    };
  }

  // ─── Tipo 44 — Regímenes Especiales ───────────────────────────────────────
  // Requiere tipoIngresos (default "01") y razonSocialComprador.
  if (tipo === '44') {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:      tipo,
        items:                mapItems43(d.items), // misma estructura que 43
        razonSocialComprador: d.razonSocialComprador,
        rncComprador:         d.rncComprador,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:           d.totales.montoTotal,
        tipoIngresos:         formatTipoIngresos(d.tipoIngresos), // "01" zero-padded
        // Todos los items de tipo 44 son exentos → montoExento = montoTotal
        montoExento:          d.totales.montoTotal,
        correoComprador:      d.emailComprador,
        eNcf:                 d.encfOverride,
        ...(fechaLimitePago ? { fechaLimitePago } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipo 46 — Exportaciones ──────────────────────────────────────────────
  // razonSocialComprador OBLIGATORIO (cliente extranjero).
  // Todos los items deben tener indicadorFacturacion=3 (ITBIS 0%).
  // Sin rncComprador (comprador es extranjero — usar identificadorExtranjero si aplica).
  if (tipo === '46') {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:      tipo,
        items:                mapItemsGeneric(d.items),
        // ECF46Dto NO tiene rncComprador — usa identificadorExtranjero para el comprador
        // DGII cod=1381: el identificador es obligatorio incluso en pruebas de habilitación
        identificadorExtranjero: d.rncComprador,
        razonSocialComprador: d.razonSocialComprador,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:           d.totales.montoTotal,
        tipoIngresos:         formatTipoIngresos(d.tipoIngresos),
        correoComprador:      d.emailComprador,
        eNcf:                 d.encfOverride,
        ...(fechaLimitePago ? { fechaLimitePago } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipo 47 — Pagos al Exterior ──────────────────────────────────────────
  // Items requieren indicadorAgenteRetencionoPercepcion y montoISRRetenido.
  if (tipo === '47') {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:      tipo,
        items:                mapItems47(d.items),
        montoTotal:           d.totales.montoTotal,
        // DGII cod=1960: todos los items en tipo 47 son exentos → montoExento = montoTotal
        montoExento:          d.totales.montoTotal,
        // DGII cod=11170: totalISRRetencion obligatorio = 27% del montoTotal (tasa ISR pagos al exterior)
        totalISRRetencion:    Math.round(d.totales.montoTotal * 0.27 * 100) / 100,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        razonSocialProveedor: d.razonSocialComprador,
        eNcf:                 d.encfOverride,
        ...(fechaLimitePago ? { fechaLimitePago } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipo 34 — Nota de Crédito ────────────────────────────────────────────
  // Requiere indicadorNotaCredito (0=dentro 30 días, 1=después 30 días).
  // Sin formasPago (no está en el DTO según spec).
  if (tipo === '34') {
    const ret = sumRetenciones(d.retenciones);
    return {
      tipo,
      esRfce: false,
      dto: {
        tipoComprobante:       tipo,
        informacionReferencia: buildInformacionReferencia(d),
        items:                 mapItemsGeneric(d.items),
        tipoPago,
        // ECF34Dto NO tiene formasPago — campo prohibido
        montoTotal:            d.totales.montoTotal,
        indicadorNotaCredito:  computeIndicadorNotaCredito(d.fechaNcfModificado),
        rncComprador:          d.rncComprador,
        razonSocialComprador:  d.razonSocialComprador,
        indicadorMontoGravado: 0,
        // EmitirEcf34Dto NO tiene montoGravadoTotal — solo totalITBIS1/2 y montoExento
        totalITBIS1:           d.totales.itbis1   || undefined,
        totalITBIS2:           d.totales.itbis2   || undefined,
        montoExento:           d.totales.montoExento || undefined,
        correoComprador:       d.emailComprador,
        eNcf:                  d.encfOverride,
        ...(ret.itbis > 0 ? { totalITBISRetenido: Math.round(ret.itbis * 100) / 100 } : {}),
        ...(ret.isr   > 0 ? { totalISRRetencion:  Math.round(ret.isr   * 100) / 100 } : {}),
        ...(fechaLimitePago ? { fechaLimitePago } : {}),
        ...skipRange,
      },
    };
  }

  // ─── Tipos 31, 32 (≥250K), 33, 45 ────────────────────────────────────────
  // Comparten estructura base. Diferencias:
  //   31, 33, 45      → indicadorMontoGravado OBLIGATORIO
  //   33              → informacionReferencia OBLIGATORIO
  //   31, 32≥250K,    → rncComprador + razonSocialComprador OBLIGATORIOS
  //   33, 45

  const fp = buildFormasPago(tipoPago, d.totales.montoTotal);

  // DGII cod=176: indicadorMontoGravado requerido en 31, 32≥250K, 33, 45
  const needsIndicadorMontoGravado = ['31', '32', '33', '45'].includes(tipo);
  // En el path genérico tipo 32 SIEMPRE es ≥250K (RFCE maneja <250K arriba).
  // RNC + razón social son obligatorios en 31, 32≥250K, 33, 45.
  const needsComprador             = ['31', '32', '33', '45'].includes(tipo);
  // tipoIngresos aplica a 31, 32 (≥250K), 45 (no en 33 que es Nota de Débito).
  const needsTipoIngresos          = ['31', '32', '45'].includes(tipo);

  const ret = sumRetenciones(d.retenciones);
  // En este path tipo 32 SIEMPRE es ≥250K (RFCE maneja <250K arriba) → formato ECF.
  const formato = tipo === '32' ? 'ECF' : undefined;

  return {
    tipo,
    esRfce: false,
    dto: {
      tipoComprobante: tipo,
      ...(formato ? { formato } : {}),
      ...(tipo === '33' ? { informacionReferencia: buildInformacionReferencia(d) } : {}),
      items:         mapItemsGeneric(d.items),
      ...(needsComprador
        ? { rncComprador: d.rncComprador, razonSocialComprador: d.razonSocialComprador }
        : {}
      ),
      ...(needsIndicadorMontoGravado ? { indicadorMontoGravado: 0 } : {}),
      tipoPago,
      ...(fp ? { formasPago: fp } : {}),
      montoTotal:           d.totales.montoTotal,
      ...totalesItbis(d.totales),
      ...(needsTipoIngresos ? { tipoIngresos: formatTipoIngresos(d.tipoIngresos) } : {}),
      correoComprador:      d.emailComprador,
      eNcf:                 d.encfOverride,
      ...(ret.itbis > 0 ? { totalITBISRetenido: Math.round(ret.itbis * 100) / 100 } : {}),
      ...(ret.isr   > 0 ? { totalISRRetencion:  Math.round(ret.isr   * 100) / 100 } : {}),
      ...(fechaLimitePago ? { fechaLimitePago } : {}),
      ...skipRange,
    },
  };
}
