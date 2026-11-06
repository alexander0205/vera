/**
 * Costo del inventario — funciones puras, sin base de datos.
 *
 * El costo de cada producto es un promedio ponderado (se recalcula en cada
 * compra, ver `entrada.ts`). Cada movimiento de stock guarda una FOTO de ese
 * costo al momento de moverse, para que un cambio de costo posterior no
 * reescriba la historia y la devolución use el costo con que salió la venta.
 */

import type { LineaAsiento } from '@/lib/contabilidad/asientos';

/** Costo con que se valora una unidad: el de la variante si lo tiene, si no el del producto. */
export function costoEfectivo(costoProducto: number | null | undefined, costoVariante?: number | null): number {
  const v = Number(costoVariante ?? 0);
  if (v > 0) return Math.round(v);
  const p = Number(costoProducto ?? 0);
  return p > 0 ? Math.round(p) : 0;
}

/** cantidad × costo unitario, redondeado UNA vez, en centavos. */
export function valorCents(cantidad: number, costoUnitarioCents: number): number {
  return Math.round(cantidad * costoUnitarioCents);
}

/** La foto de un movimiento: null si no hay costo (no se valora, no genera asiento). */
export interface FotoCosto { costoUnitarioCents: number; costoTotalCents: number }

export function fotoDeCosto(cantidad: number, costoUnitarioCents: number): FotoCosto | null {
  if (!(costoUnitarioCents > 0) || !(cantidad > 0)) return null;
  const total = valorCents(cantidad, costoUnitarioCents);
  return total > 0 ? { costoUnitarioCents, costoTotalCents: total } : null;
}

export interface MovimientoValorado { tipo: string; cantidad: number; costoTotalCents: number | null }

/**
 * Cuánto vale devolver `cantidadDevuelta` unidades de lo que salió en las ventas
 * de un documento. Usa el costo REAL con que salieron (promedio de las ventas
 * valoradas, menos lo ya devuelto): si se devuelve todo lo pendiente, devuelve
 * exactamente lo que quedaba por revertir, sin diferencia de redondeo.
 *
 * null = la venta no se valoró (anterior a la migración o producto sin costo):
 * no se contabilizó costo, así que tampoco hay nada que revertir.
 */
export function valorDeDevolucion(previos: MovimientoValorado[], cantidadDevuelta: number): FotoCosto | null {
  let cantVendida = 0, valorVendido = 0, cantDevuelta = 0, valorDevuelto = 0;
  for (const m of previos) {
    if (m.costoTotalCents == null) continue;
    if (m.tipo === 'VENTA') { cantVendida += m.cantidad; valorVendido += m.costoTotalCents; }
    else if (m.tipo === 'DEVOLUCION') { cantDevuelta += m.cantidad; valorDevuelto += m.costoTotalCents; }
  }
  const cantPendiente = cantVendida - cantDevuelta;
  const valorPendiente = valorVendido - valorDevuelto;
  if (cantVendida <= 0 || cantPendiente <= 0 || valorPendiente <= 0 || cantidadDevuelta <= 0) return null;
  const total = cantidadDevuelta >= cantPendiente
    ? valorPendiente
    : Math.round((valorPendiente * cantidadDevuelta) / cantPendiente);
  if (total <= 0) return null;
  const aDevolver = Math.min(cantidadDevuelta, cantPendiente);
  return { costoUnitarioCents: Math.round(total / aDevolver), costoTotalCents: total };
}

// ─── Partidas ────────────────────────────────────────────────────────────────

export interface CuentasInventario {
  inventarioId: number;
  costoVentasId: number;
  /** Mermas y sobrantes. */
  mermasId: number;
  /** Contrapartida del stock inicial. */
  aperturaId: number;
}

export interface MovimientoParaAsiento { tipo: string; costoTotalCents: number; descripcion: string }

/**
 * Partidas de un lote de movimientos de UN documento y de UN sentido.
 *   VENTA        Dr 5101 Costo de ventas   / Cr 1105 Inventario
 *   DEVOLUCION   Dr 1105 Inventario        / Cr 5101 Costo de ventas
 */
export function partidasCostoVenta(movs: MovimientoParaAsiento[], c: CuentasInventario): LineaAsiento[] {
  const salida = movs.every((m) => m.tipo === 'VENTA');
  const total = movs.reduce((s, m) => s + m.costoTotalCents, 0);
  if (total <= 0) return [];
  const txt = salida ? 'Costo de la mercancía vendida' : 'Costo de la mercancía devuelta';
  const detalle = [...new Set(movs.map((m) => m.descripcion))].join(', ').slice(0, 200);
  const lineaCosto: LineaAsiento = {
    cuentaId: c.costoVentasId, debeCents: salida ? total : 0, haberCents: salida ? 0 : total, descripcion: detalle || txt,
  };
  const lineaInv: LineaAsiento = {
    cuentaId: c.inventarioId, debeCents: salida ? 0 : total, haberCents: salida ? total : 0, descripcion: txt,
  };
  return salida ? [lineaCosto, lineaInv] : [lineaInv, lineaCosto];
}

/**
 *   AJUSTE_SALIDA (merma)                 Dr 5102 Mermas y sobrantes / Cr 1105
 *   AJUSTE_ENTRADA / ENTRADA sin factura  Dr 1105 / Cr 5102
 *   STOCK_INICIAL                         Dr 1105 / Cr 3102 Resultados acumulados
 */
export function partidasAjusteInventario(tipo: string, valor: number, descripcion: string, c: CuentasInventario): LineaAsiento[] {
  if (valor <= 0) return [];
  if (tipo === 'AJUSTE_SALIDA') {
    return [
      { cuentaId: c.mermasId, debeCents: valor, haberCents: 0, descripcion },
      { cuentaId: c.inventarioId, debeCents: 0, haberCents: valor, descripcion: 'Salida de inventario' },
    ];
  }
  const contra = tipo === 'STOCK_INICIAL' ? c.aperturaId : c.mermasId;
  return [
    { cuentaId: c.inventarioId, debeCents: valor, haberCents: 0, descripcion },
    { cuentaId: contra, debeCents: 0, haberCents: valor, descripcion: tipo === 'STOCK_INICIAL' ? 'Apertura del inventario' : 'Entrada de inventario' },
  ];
}

// ─── Valor del inventario vs. cuenta 1105 ────────────────────────────────────

export interface FilaValuacion { existencia: number; costoUnitarioCents: number }

export function valorFila(f: FilaValuacion): number {
  return f.existencia > 0 ? valorCents(f.existencia, f.costoUnitarioCents) : 0;
}

export interface ResumenValuacion {
  valorInventarioCents: number;
  saldoContableCents: number;
  /** valor − saldo. Positivo: el inventario vale más de lo que dice el libro. */
  diferenciaCents: number;
  cuadra: boolean;
}

export function resumenValuacion(filas: FilaValuacion[], saldoContableCents: number): ResumenValuacion {
  const valor = filas.reduce((s, f) => s + valorFila(f), 0);
  const dif = valor - saldoContableCents;
  return { valorInventarioCents: valor, saldoContableCents, diferenciaCents: dif, cuadra: dif === 0 };
}

/**
 * El asiento que lleva 1105 al valor del inventario.
 *   Inventario vale MÁS que el libro:  Dr 1105 / Cr contrapartida (por defecto 3102)
 *   Inventario vale MENOS:             Dr contrapartida (por defecto 5101) / Cr 1105
 */
export function partidasCuadreInventario(diferenciaCents: number, inventarioId: number, contrapartidaId: number): LineaAsiento[] {
  if (!Number.isSafeInteger(diferenciaCents) || diferenciaCents === 0) return [];
  const m = Math.abs(diferenciaCents);
  const d = 'Ajuste para cuadrar el inventario con su valor';
  return diferenciaCents > 0
    ? [{ cuentaId: inventarioId, debeCents: m, haberCents: 0, descripcion: d }, { cuentaId: contrapartidaId, debeCents: 0, haberCents: m, descripcion: d }]
    : [{ cuentaId: contrapartidaId, debeCents: m, haberCents: 0, descripcion: d }, { cuentaId: inventarioId, debeCents: 0, haberCents: m, descripcion: d }];
}
