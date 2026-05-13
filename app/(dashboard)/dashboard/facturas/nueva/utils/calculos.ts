import type { ItemLinea } from './types';

export function tasaToFloat(t: string): number | undefined {
  if (t === 'exento') return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

export function calcularMontoItem(item: ItemLinea): number {
  const base = item.cantidadItem * item.precioUnitarioItem;
  const desc = base * (item.descuentoPct / 100);
  const neto = Math.max(0, base - desc);
  const tasa = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
  return neto + neto * tasa;
}

export function calcularTotales(items: ItemLinea[]) {
  let bruto = 0; let descuento = 0; let itbis = 0;
  for (const item of items) {
    const base = item.cantidadItem * item.precioUnitarioItem;
    const desc = base * (item.descuentoPct / 100);
    const neto = Math.max(0, base - desc);
    const tasa = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
    bruto    += base;
    descuento += desc;
    itbis    += neto * tasa;
  }
  const subtotal = bruto - descuento;
  return { bruto, subtotal, descuento, itbis, total: subtotal + itbis };
}

let nextId = 1;
export function itemVacio(): ItemLinea {
  return {
    id: nextId++,
    nombreItem: '', referencia: '', descripcionItem: '',
    cantidadItem: 1, precioUnitarioItem: 0, descuentoPct: 0,
    tasaItbis: '0.18', indicadorBienoServicio: '2',
  };
}
