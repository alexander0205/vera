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

/**
 * Método interno: aplicar el saldo a favor del cliente (generado por Notas de
 * Crédito) a otra factura. NO se ofrece en el dropdown de pago cash; se aplica
 * desde un flujo aparte. NO cuenta como efectivo en caja.
 */
export const METODO_SALDO_FAVOR = 'saldo_favor' as const;

/**
 * Método: pagar con una Nota de Crédito específica (voucher por código). Se ofrece
 * en el repeater cuando hay cliente; al elegirlo se selecciona la NC y se aplica su
 * monto (uso único). Distinto de saldo_favor (crédito agregado del cliente).
 */
export const METODO_NOTA_CREDITO = 'nota_credito' as const;

/** Todos los métodos ACEPTADOS por el backend (ofrecidos + internos). */
export const METODO_PAGO_VALUES_VALIDOS = [
  ...METODO_PAGO_VALUES,
  METODO_SALDO_FAVOR,
  METODO_NOTA_CREDITO,
] as const;

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
  saldo_favor:     'Saldo a favor',
  nota_credito:    'Nota de crédito',
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
