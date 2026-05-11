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
  codigoModificacion?: string;
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
    const tasa      = item.tasaItbis ?? 0.18; // tipo 41 siempre es 18% en pruebas
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
        montoITBISRetenido: Math.round(montoItem * tasa * 100) / 100,
        montoISRRetenido:   0,
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
  return {
    ncfModificado:       d.ncfModificado,
    codigoModificacion:  d.codigoModificacion ? Number(d.codigoModificacion) : 1,
    // OBLIGATORIO según XSD DGII — defecto: fecha del día (misma emisión)
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
    return {
      tipo,
      esRfce: true,
      dto: {
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:      d.totales.montoTotal,
        totalITBIS1:     d.totales.itbis1  || undefined,
        totalITBIS2:     d.totales.itbis2  || undefined,
        // RFCE32 usa montoGravadoI1/I2/I3 — montoGravadoTotal no existe en este DTO
        montoGravadoI1:  d.totales.montoGravadoTotal || undefined,
        montoExento:     d.totales.montoExento || undefined,
        correoComprador: d.emailComprador,
        rncComprador:    d.rncComprador,
        eNcf:            d.encfOverride,
        ...skipRange,
      },
    };
  }

  // ─── Tipo 41 — Comprobante de Compras ──────────────────────────────────────
  // Campos distintos: usa rncProveedor/razonSocialProveedor (no rncComprador).
  // Requiere fechaVencimientoSecuencia y retencion en cada item.
  if (tipo === '41') {
    const fp = buildFormasPago(tipoPago, d.totales.montoTotal);
    return {
      tipo,
      esRfce: false,
      dto: {
        items:                     mapItems41(d.items),
        rncProveedor:              d.rncComprador,
        razonSocialProveedor:      d.razonSocialComprador,
        fechaVencimientoSecuencia: normalizeFechaVenc(d.fechaVencimientoSecuencia),
        indicadorMontoGravado:     0,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:                d.totales.montoTotal,
        totalITBIS1:               d.totales.itbis1  || undefined,
        totalITBIS2:               d.totales.itbis2  || undefined,
        // DGII cod=11160: totalITBISRetenido = suma de montoITBISRetenido de todos los items
        totalITBISRetenido:        d.totales.itbis1 + (d.totales.itbis2 || 0),
        // totalISRRetencion = suma de montoISRRetenido de items (0 cuando no hay retención ISR)
        totalISRRetencion:         0,
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
        items:                mapItems43(d.items), // misma estructura que 43
        razonSocialComprador: d.razonSocialComprador,
        rncComprador:         d.rncComprador,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:           d.totales.montoTotal,
        tipoIngresos:         '01', // 01=Operaciones no financieras (default)
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
        items:                mapItemsGeneric(d.items),
        // ECF46Dto NO tiene rncComprador — usa identificadorExtranjero para el comprador
        // DGII cod=1381: el identificador es obligatorio incluso en pruebas de habilitación
        identificadorExtranjero: d.rncComprador,
        razonSocialComprador: d.razonSocialComprador,
        tipoPago,
        ...(fp ? { formasPago: fp } : {}),
        montoTotal:           d.totales.montoTotal,
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
    return {
      tipo,
      esRfce: false,
      dto: {
        informacionReferencia: buildInformacionReferencia(d),
        items:                 mapItemsGeneric(d.items),
        tipoPago,
        // ECF34Dto NO tiene formasPago — campo prohibido
        montoTotal:            d.totales.montoTotal,
        indicadorNotaCredito:  0, // 0=emitida dentro de los 30 días calendario
        rncComprador:          d.rncComprador,
        razonSocialComprador:  d.razonSocialComprador,
        indicadorMontoGravado: 0,
        // EmitirEcf34Dto NO tiene montoGravadoTotal — solo totalITBIS1/2 y montoExento
        totalITBIS1:           d.totales.itbis1   || undefined,
        totalITBIS2:           d.totales.itbis2   || undefined,
        montoExento:           d.totales.montoExento || undefined,
        correoComprador:       d.emailComprador,
        eNcf:                  d.encfOverride,
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

  return {
    tipo,
    esRfce: false,
    dto: {
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
      correoComprador:      d.emailComprador,
      eNcf:                 d.encfOverride,
      ...(fechaLimitePago ? { fechaLimitePago } : {}),
      ...skipRange,
    },
  };
}
