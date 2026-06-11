/**
 * Métodos de pago — FUENTE ÚNICA de verdad para todo el sistema.
 *
 * Dropdowns (factura, cuentas por cobrar, caja) y validación de backend deben
 * importar de aquí. No duplicar listas en componentes ni rutas.
 *
 * `METODO_PAGO_VALUES` = lo que se OFRECE al usuario al registrar un pago.
 * `METODO_PAGO_LABELS` = labels de TODOS los valores posibles, incluyendo los
 * históricos que ya no se ofrecen (tarjeta_credito/_debito) y el alias `cash`,
 * para que el historial / PDF / cuadre los muestre bien.
 */

/** Métodos ofrecidos al usuario (dropdowns + validación de entradas nuevas). */
export const METODO_PAGO_VALUES = [
  'efectivo',
  'transferencia',
  'tarjeta',
  'cheque',
  'deposito',
  'otro',
] as const;

export type MetodoPago = (typeof METODO_PAGO_VALUES)[number];

export interface MetodoOption { value: string; label: string }

/** Labels de TODOS los métodos (incl. históricos no ofrecidos + alias). MOSTRAR. */
export const METODO_PAGO_LABELS: Record<string, string> = {
  efectivo:        'Efectivo',
  cash:            'Efectivo',
  transferencia:   'Transferencia',
  tarjeta:         'Tarjeta',
  tarjeta_credito: 'Tarjeta crédito',
  tarjeta_debito:  'Tarjeta débito',
  cheque:          'Cheque',
  deposito:        'Depósito',
  otro:            'Otro',
};

/** Opciones para dropdowns — solo los métodos ofrecidos, en orden canónico. */
export const METODOS_PAGO: MetodoOption[] = METODO_PAGO_VALUES.map((v) => ({
  value: v,
  label: METODO_PAGO_LABELS[v],
}));

/** Set para validación O(1) en backend. */
export const METODOS_PAGO_SET: ReadonlySet<string> = new Set(METODO_PAGO_VALUES);

/** Métodos que cuentan como efectivo físico en la caja. */
export function esEfectivo(metodo: string | null | undefined): boolean {
  const m = (metodo ?? '').trim().toLowerCase();
  return m === 'efectivo' || m === 'cash';
}

/** Label legible de un método (cubre históricos y alias). */
export function labelMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? '').trim().toLowerCase();
  return METODO_PAGO_LABELS[m] ?? metodo ?? '—';
}
