/**
 * Convierte el payload interno de emitedo al DTO que espera ecf-api.
 * ecf-api firma, asigna NCF y envía a DGII — emitedo ya no lo hace directamente.
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
  rncComprador?: string;
  razonSocialComprador?: string;
  emailComprador?: string;
  tipoPago: number;
  fechaLimitePago?: string;
  ncfModificado?: string;
  codigoModificacion?: string;
  encfOverride?: string;
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
  return 3; // 3=gratuito y 4=uso propio → gratuito
}

function mapItems(items: EmitedoItem[]) {
  return items.map(item => ({
    indicadorFacturacion:  tasaToIndicador(item.tasaItbis),
    nombreItem:            item.nombreItem,
    indicadorBienoServicio: item.indicadorBienoServicio ?? 1,
    cantidadItem:          item.cantidadItem,
    precioUnitarioItem:    item.precioUnitarioItem,
    montoItem:             item.cantidadItem * item.precioUnitarioItem - (item.descuentoMonto ?? 0),
    descripcionItem:       item.descripcionItem,
    descuentoMonto:        item.descuentoMonto,
  }));
}

function baseDto(d: EmitedoEmisionData) {
  return {
    items:         mapItems(d.items),
    tipoPago:      mapTipoPago(d.tipoPago),
    montoTotal:    d.totales.montoTotal,
    totalITBIS1:   d.totales.itbis1  || undefined,
    totalITBIS2:   d.totales.itbis2  || undefined,
    montoGravadoTotal: d.totales.montoGravadoTotal || undefined,
    montoExento:   d.totales.montoExento || undefined,
    correoComprador: d.emailComprador,
    eNcf:          d.encfOverride,
    ...(d.fechaLimitePago ? { fechaLimitePago: toddMMyyyy(d.fechaLimitePago) } : {}),
  };
}

function informacionReferencia(d: EmitedoEmisionData) {
  if (!d.ncfModificado) return undefined;
  return {
    ncfModificado:      d.ncfModificado,
    codigoModificacion: d.codigoModificacion ? Number(d.codigoModificacion) : 1,
  };
}

// YYYY-MM-DD → dd-MM-yyyy (formato ecf-api)
function toddMMyyyy(iso: string): string {
  const [y, m, day] = iso.split('-');
  return `${day}-${m}-${y}`;
}

// ─── Mapper principal ─────────────────────────────────────────────────────────

export function mapToEcfApiDto(d: EmitedoEmisionData): {
  tipo: string;
  esRfce: boolean;
  dto: Record<string, unknown>;
} {
  const base = baseDto(d);
  const tipo = d.tipoEcf;

  // rfce32: tipo 32, monto < 250k → formato simplificado sin items
  const esRfce = tipo === '32' && d.totales.montoTotal < 250_000;

  if (esRfce) {
    return {
      tipo,
      esRfce: true,
      dto: {
        tipoPago:         base.tipoPago,
        montoTotal:       base.montoTotal,
        totalITBIS1:      base.totalITBIS1,
        totalITBIS2:      base.totalITBIS2,
        montoGravadoTotal: base.montoGravadoTotal,
        montoExento:      base.montoExento,
        correoComprador:  base.correoComprador,
        rncComprador:     d.rncComprador,
        eNcf:             d.encfOverride,
      },
    };
  }

  // Tipos que requieren rncComprador + razonSocialComprador
  const needsComprador = ['31', '33', '34', '44', '45'].includes(tipo);

  const compradorFields = needsComprador ? {
    rncComprador:         d.rncComprador,
    razonSocialComprador: d.razonSocialComprador,
  } : {
    rncComprador: d.rncComprador, // opcional en tipos 32, 46, 47
  };

  // Tipos con InformacionReferencia (notas crédito/débito)
  const refFields = ['33', '34'].includes(tipo)
    ? { informacionReferencia: informacionReferencia(d) }
    : {};

  // indicadorMontoGravado obligatorio en tipo 31 (emitedo guarda precios sin ITBIS → 0)
  const indicadorFields = tipo === '31' ? { indicadorMontoGravado: 0 } : {};

  return {
    tipo,
    esRfce: false,
    dto: {
      ...base,
      ...compradorFields,
      ...indicadorFields,
      ...refFields,
    },
  };
}
