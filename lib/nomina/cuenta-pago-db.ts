/**
 * Caja o banco de donde sale un pago de nómina: qué cuentas se pueden elegir y
 * cómo se valida lo que llega por la API.
 */

import { cuentasDeSalida } from '@/lib/contabilidad/config';

export type CuentaSalidaValidada = { ok: true; id: number | null } | { ok: false; error: string };

/**
 * `undefined` o `null` = sin elegir (se usa la de por defecto). Si viene, tiene
 * que ser el id de una cuenta que de verdad pueda soltar dinero —caja, bancos o
 * cobros por liquidar— de ESTA empresa: un haber contra un gasto o contra una
 * cuenta ajena cuadra igual y nadie lo nota hasta el cierre.
 */
export async function validarCuentaSalida(teamId: number, v: unknown): Promise<CuentaSalidaValidada> {
  if (v === undefined || v === null || v === '') return { ok: true, id: null };
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) return { ok: false, error: 'La cuenta de pago no es válida' };
  const { cuentas } = await cuentasDeSalida(teamId);
  if (!cuentas.some((c) => c.id === v)) {
    return { ok: false, error: 'Esa cuenta no puede usarse para pagar: elige una caja o un banco activo' };
  }
  return { ok: true, id: v };
}

/** Las cuentas entre las que se puede elegir, listas para un selector. */
export async function opcionesCuentaSalida(teamId: number) {
  const { cuentas } = await cuentasDeSalida(teamId);
  return cuentas
    .map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
