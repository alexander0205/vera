/** Reglas puras para distribuir una compra entre inventario e ITBIS. */

export type RegimenItbis = 'exento' | 'gravado';

export interface DistribucionCompra {
  inventarioCents:      number;
  itbisAdelantadoCents: number;
}

/**
 * `montoTotalCents` siempre incluye el ITBIS informado por la compra.
 * Una empresa exenta no puede acreditar ese impuesto: forma parte del costo.
 */
export function distribuirCompra(
  montoTotalCents: number,
  itbisCents: number,
  regimenItbis: RegimenItbis,
): DistribucionCompra {
  if (!Number.isSafeInteger(montoTotalCents) || montoTotalCents <= 0) {
    throw new Error('El total de la compra debe ser un monto positivo en centavos.');
  }
  if (!Number.isSafeInteger(itbisCents) || itbisCents < 0 || itbisCents > montoTotalCents) {
    throw new Error('El ITBIS de la compra debe estar entre cero y el total.');
  }

  if (regimenItbis === 'gravado' && itbisCents > 0) {
    return {
      inventarioCents: montoTotalCents - itbisCents,
      itbisAdelantadoCents: itbisCents,
    };
  }

  return { inventarioCents: montoTotalCents, itbisAdelantadoCents: 0 };
}
