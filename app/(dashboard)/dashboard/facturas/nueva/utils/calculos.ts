import type { ItemLinea } from './types';

/** Round to 2 decimals (DGII canonical precision for monetary values). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function tasaToFloat(t: string | undefined | null): number | undefined {
  if (!t || t === 'exento') return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

/** Convierte a número seguro — NaN/undefined/null/string vacío → 0 */
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function calcularMontoItem(item: ItemLinea): number {
  const cant = toNum(item.cantidadItem);
  const prec = toNum(item.precioUnitarioItem);
  const descPct = toNum(item.descuentoPct);
  const base = cant * prec;
  const desc = base * (descPct / 100);
  const neto = Math.max(0, base - desc);
  const tasa = (!item.tasaItbis || item.tasaItbis === 'exento') ? 0 : toNum(item.tasaItbis);
  return round2(neto + neto * tasa);
}

export function calcularTotales(items: ItemLinea[]) {
  let bruto = 0; let descuento = 0; let itbis = 0;
  for (const item of items) {
    const cant = toNum(item.cantidadItem);
    const prec = toNum(item.precioUnitarioItem);
    const descPct = toNum(item.descuentoPct);
    const base = cant * prec;
    const desc = base * (descPct / 100);
    const neto = Math.max(0, base - desc);
    const tasa = (!item.tasaItbis || item.tasaItbis === 'exento') ? 0 : toNum(item.tasaItbis);
    bruto    += base;
    descuento += desc;
    itbis    += neto * tasa;
  }
  const subtotalR = round2(bruto - descuento);
  const itbisR = round2(itbis);
  return {
    bruto: round2(bruto),
    subtotal: subtotalR,
    descuento: round2(descuento),
    itbis: itbisR,
    total: round2(subtotalR + itbisR),
  };
}

let nextId = 1;
export function itemVacio(): ItemLinea {
  return {
    id: nextId++,
    nombreItem: '', referencia: '', descripcionItem: '',
    cantidadItem: 1, precioUnitarioItem: 0, descuentoPct: 0,
    tasaItbis: '0.18', indicadorBienoServicio: '2',
    dependienteId: null, dependienteNombre: '',
  };
}
