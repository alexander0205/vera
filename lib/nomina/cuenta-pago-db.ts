/**
 * Caja o banco de donde sale un pago de nómina: qué cuentas se pueden elegir y
 * cómo se valida lo que llega por la API.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cuentasDeSalida } from '@/lib/contabilidad/config';
import { toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';

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

// ─── Lo que guarda la migración 0231, tolerante a que aún no corrió ──────────

type TablaConCuenta = 'nomina_pagos' | 'nomina_obligaciones';

/** Anota de qué caja o banco salió un pago. Sin la migración o sin cuenta elegida, no hace nada. */
export async function guardarCuentaSalida(tabla: TablaConCuenta, teamId: number, id: number, cuentaId: number | null): Promise<void> {
  if (cuentaId === null) return;
  await toleraMigracionPendiente(async () => {
    await db.execute(sql`UPDATE ${sql.raw(tabla)} SET cuenta_salida_id = ${cuentaId} WHERE id = ${id} AND team_id = ${teamId}`);
  }, undefined);
}

/** La cuenta elegida en ese pago; null si no se eligió o la migración no corrió. */
export async function cuentaSalidaElegida(tabla: TablaConCuenta, teamId: number, id: number): Promise<number | null> {
  return toleraMigracionPendiente(async () => {
    const filas = await db.execute(sql`SELECT cuenta_salida_id AS cuenta FROM ${sql.raw(tabla)} WHERE id = ${id} AND team_id = ${teamId}`);
    const v = (filas as unknown as { cuenta: number | null }[])[0]?.cuenta;
    return v == null ? null : Number(v);
  }, null);
}

export interface CuentasPagoNomina { efectivoId: number | null; bancoId: number | null }

/** Las cuentas por defecto para pagar nómina (caja y banco). */
export async function cuentasPagoNomina(teamId: number): Promise<CuentasPagoNomina> {
  return toleraMigracionPendiente(async () => {
    const filas = await db.execute(sql`
      SELECT cuenta_nomina_pago_efectivo_id AS "efectivoId", cuenta_nomina_pago_banco_id AS "bancoId"
      FROM contabilidad_config WHERE team_id = ${teamId}`);
    const f = (filas as unknown as { efectivoId: number | null; bancoId: number | null }[])[0];
    return { efectivoId: f?.efectivoId ?? null, bancoId: f?.bancoId ?? null };
  }, { efectivoId: null, bancoId: null });
}

/** Fija las cuentas por defecto. Crea la fila de configuración si la empresa nunca la tocó. */
export async function guardarCuentasPagoNomina(teamId: number, cambios: Partial<CuentasPagoNomina>, userId: number): Promise<CuentasPagoNomina> {
  const actual = await cuentasPagoNomina(teamId);
  const nuevo = {
    efectivoId: cambios.efectivoId === undefined ? actual.efectivoId : cambios.efectivoId,
    bancoId: cambios.bancoId === undefined ? actual.bancoId : cambios.bancoId,
  };
  await db.execute(sql`
    INSERT INTO contabilidad_config (team_id, cuenta_nomina_pago_efectivo_id, cuenta_nomina_pago_banco_id, updated_by, updated_at)
    VALUES (${teamId}, ${nuevo.efectivoId}, ${nuevo.bancoId}, ${userId}, now())
    ON CONFLICT (team_id) DO UPDATE SET
      cuenta_nomina_pago_efectivo_id = EXCLUDED.cuenta_nomina_pago_efectivo_id,
      cuenta_nomina_pago_banco_id = EXCLUDED.cuenta_nomina_pago_banco_id,
      updated_by = ${userId}, updated_at = now()`);
  return nuevo;
}
