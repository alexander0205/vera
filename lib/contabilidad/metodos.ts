/**
 * lib/contabilidad/metodos.ts — Claves contables de cobro y sus etiquetas.
 *
 * **Separado de `config.ts` a propósito.** La pantalla de configuración es un
 * componente de cliente y necesita estas constantes; `config.ts` importa `db`,
 * que arrastra `postgres` y por tanto `fs`, que no existe en el navegador.
 * Meter esto ahí rompe el build del cliente con "Can't resolve 'fs'".
 *
 * Aquí no debe entrar nada que toque la base de datos.
 */

/**
 * Claves contables de cobro. **No son exactamente `pagos_recibidos.metodo`**:
 * un cobro por link de pago se guarda como `metodo='tarjeta'` y aquí se separa
 * en `pasarela_cardnet` / `pasarela_azul`, porque contablemente van a cuentas
 * distintas. La traducción la hace `claveContableDePago()` en `config.ts`.
 */
export const CLAVES_METODO = [
  'efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito', 'otro',
  'saldo_favor', 'nota_credito', 'pasarela_cardnet', 'pasarela_azul',
] as const;

export type ClaveMetodo = (typeof CLAVES_METODO)[number];

export const CLAVE_METODO_LABEL: Record<ClaveMetodo, string> = {
  efectivo:         'Efectivo',
  transferencia:    'Transferencia',
  tarjeta:          'Tarjeta (en mostrador)',
  cheque:           'Cheque',
  deposito:         'Depósito',
  otro:             'Otro',
  saldo_favor:      'Saldo a favor',
  nota_credito:     'Nota de crédito',
  pasarela_cardnet: 'Link de pago — CardNet',
  pasarela_azul:    'Link de pago — Azul',
};

/**
 * Métodos que NO mueven dinero real y por tanto no llevan cuenta de cobro.
 *
 * `saldo_favor` y `nota_credito` no son una entrada de efectivo: son la
 * aplicación de un crédito que el cliente ya tenía. Su asiento lo arma el Paso 5
 * contra la cuenta de descuentos, no contra caja ni banco.
 */
export const CLAVES_SIN_COBRO: ClaveMetodo[] = ['saldo_favor', 'nota_credito'];

/** Las pasarelas son las únicas que retienen comisión al liquidar. */
export function esPasarela(clave: ClaveMetodo): boolean {
  return clave === 'pasarela_cardnet' || clave === 'pasarela_azul';
}
