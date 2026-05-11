/**
 * Núcleo del módulo de facturación: tipos, cálculo, formato y validaciones.
 * Cero React — usable en server actions, scripts, tests.
 *
 * Lo usan tanto Lite como (eventualmente) el dashboard Full.
 */

import { calcularTotales, type EcfItemInput } from '@/lib/ecf/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TasaItbis         = 0 | 0.16 | 0.18;
export type TipoBienOServicio = 1 | 2;            // 1=Bien, 2=Servicio
export type TipoPago          = 1 | 2 | 3;        // 1=Contado, 2=Crédito, 3=Gratuito
export type TipoEcf           = '31' | '32' | '33' | '34' | '41' | '43' | '44' | '45' | '46' | '47';

export interface ItemLinea {
  id:        string;
  nombre:    string;
  cantidad:  number;
  precio:    number;
  tasaItbis: TasaItbis;
  tipo?:     TipoBienOServicio;
}

export interface FacturaFormDefaults {
  tipoEcf?:      TipoEcf;
  tipoPago?:     TipoPago;
  rncComprador?: string;
  razonSocial?:  string;
}

export interface FacturaResultado {
  encf:        string;
  estado:      string;
  documentoId: number;
  trackId?:    string;
}

export interface FacturaRow {
  id:                   number;
  encf:                 string;
  tipoEcf:              string;
  estado:               string;
  razonSocialComprador: string | null;
  montoTotal:           number; // en centavos
  createdAt:            Date;
}

export interface TotalesUI {
  subtotal:   number;
  totalItbis: number;
  montoTotal: number;
}

// ─── Utilidades ────────────────────────────────────────────────────────────────

export function nuevoItem(): ItemLinea {
  return { id: crypto.randomUUID(), nombre: '', cantidad: 1, precio: 0, tasaItbis: 0.18 };
}

/**
 * Calcula totales en formato UI (subtotal, ITBIS, total).
 * Internamente delega a calcularTotales() del backend para garantizar
 * que la UI muestre EXACTAMENTE lo que se enviará a DGII.
 */
export function calcularTotalesUI(items: ItemLinea[]): TotalesUI {
  const ecfItems: EcfItemInput[] = items.map(it => ({
    nombreItem:             it.nombre,
    cantidadItem:           it.cantidad,
    precioUnitarioItem:     it.precio,
    tasaItbis:              it.tasaItbis,
    indicadorBienoServicio: it.tipo,
  }));
  const t = calcularTotales(ecfItems);
  return {
    subtotal:   t.montoGravadoTotal + t.montoExento,
    totalItbis: t.totalItbis,
    montoTotal: t.montoTotal,
  };
}

/** Convierte items de UI al payload que espera /api/ecf/emitir. */
export function itemsToPayload(items: ItemLinea[]) {
  return items
    .filter(it => it.nombre.trim() && it.precio > 0)
    .map(it => ({
      nombreItem:             it.nombre.trim(),
      cantidadItem:           it.cantidad,
      precioUnitarioItem:     it.precio,
      tasaItbis:              it.tasaItbis,
      indicadorBienoServicio: it.tipo,
    }));
}

// ─── Formateadores ─────────────────────────────────────────────────────────────

export const fmtMoneda = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);

export const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);

// ─── Validaciones ──────────────────────────────────────────────────────────────

const REQUIERE_COMPRADOR: ReadonlyArray<TipoEcf> = ['31', '33', '34', '41', '45'];

/** Devuelve null si todo está bien, o un mensaje de error. */
export function validarFactura(opts: {
  items:        ItemLinea[];
  tipoEcf:      TipoEcf;
  rncComprador: string;
  razonSocial:  string;
  totales:      TotalesUI;
}): string | null {
  const validos = opts.items.filter(it => it.nombre.trim() && it.precio > 0);
  if (validos.length === 0) {
    return 'Agrega al menos un item con nombre y precio.';
  }

  const tieneDatos = !!(opts.rncComprador.trim() && opts.razonSocial.trim());

  if (opts.tipoEcf === '32' && opts.totales.montoTotal >= 250_000 && !tieneDatos) {
    return 'Para facturas de RD$250,000 o más, completa el RNC y la razón social.';
  }
  if (REQUIERE_COMPRADOR.includes(opts.tipoEcf) && !tieneDatos) {
    return `El tipo ${opts.tipoEcf} requiere RNC y razón social del comprador.`;
  }
  return null;
}
