/**
 * Un asiento manual dentro de la transacción de quien lo pide.
 *
 * `generarAsientoManual` abre su propia transacción (otra conexión), así que
 * quien necesita que el asiento y otra marca (la baja de un activo, el depósito
 * de un extracto, un movimiento de banco con su candado) salgan juntos o no
 * salgan no puede usarlo. Esto aplica las MISMAS reglas —cuadre, una sola
 * columna por línea, cuentas de la empresa, activas e imputables— sobre el `tx`
 * que se le pasa, con el `origen_id` de la secuencia de asientos manuales.
 */

import { sql } from 'drizzle-orm';
import type { db } from '@/lib/db/drizzle';
import { AsientoManualError } from './asientos';

type Ejecutor = Pick<typeof db, 'execute'>;

export interface LineaManualTx {
  cuentaId: number;
  debeCents: number;
  haberCents: number;
  descripcion?: string | null;
}

/** Las cuentas son de la empresa, están activas y aceptan movimientos. */
export async function validarCuentasDeAsiento(ex: Ejecutor, teamId: number, ids: number[]): Promise<void> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) throw new AsientoManualError('Un asiento necesita cuentas.');
  const filas = await ex.execute(sql`
    SELECT id, imputable, activa FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id IN (${sql.join(unicos.map((i) => sql`${i}`), sql`, `)})`) as unknown as { id: number; imputable: boolean; activa: boolean }[];
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const id of unicos) {
    const c = porId.get(id);
    if (!c) throw new AsientoManualError('Alguna cuenta no existe en este equipo.');
    if (!c.activa) throw new AsientoManualError('No se puede usar una cuenta desactivada.');
    if (!c.imputable) throw new AsientoManualError('No se puede usar una cuenta de agrupación; elige una cuenta de detalle.');
  }
}

export async function insertarAsientoManualTx(
  tx: Ejecutor,
  teamId: number,
  entrada: { fecha: string; concepto: string; lineas: LineaManualTx[] },
  userId: number | null,
  /** Un origen propio (p. ej. la compra de un activo): su índice único impide asentarlo dos veces. Sin él, el asiento es manual. */
  origen?: { tipo: string; id: number },
): Promise<{ asientoId: number }> {
  const concepto = (entrada.concepto ?? '').trim().slice(0, 255);
  if (!concepto) throw new AsientoManualError('El concepto es obligatorio.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha) || new Date(`${entrada.fecha}T00:00:00Z`).toISOString().slice(0, 10) !== entrada.fecha) {
    throw new AsientoManualError('La fecha no es válida.');
  }
  if (entrada.lineas.length < 2) throw new AsientoManualError('Un asiento necesita al menos dos líneas.');

  let debe = 0; let haber = 0;
  for (const l of entrada.lineas) {
    if (!Number.isSafeInteger(l.cuentaId) || l.cuentaId <= 0) throw new AsientoManualError('Cada línea debe apuntar a una cuenta.');
    if (!Number.isSafeInteger(l.debeCents) || !Number.isSafeInteger(l.haberCents) || l.debeCents < 0 || l.haberCents < 0) {
      throw new AsientoManualError('Los importes no pueden ser negativos.');
    }
    if ((l.debeCents > 0) === (l.haberCents > 0)) throw new AsientoManualError('Cada línea es débito O crédito, no ambos ni ninguno.');
    debe += l.debeCents; haber += l.haberCents;
  }
  if (debe !== haber) throw new AsientoManualError(`El asiento no cuadra: debe ${debe / 100} ≠ haber ${haber / 100}.`);
  if (debe === 0) throw new AsientoManualError('El asiento no puede ser por cero.');
  await validarCuentasDeAsiento(tx, teamId, entrada.lineas.map((l) => l.cuentaId));

  const origenTipo = origen?.tipo ?? 'manual';
  const origenId = origen ? origen.id : ((await tx.execute(sql`SELECT nextval('contabilidad_asiento_manual_seq')::int AS origen_id`)) as unknown as { origen_id: number }[])[0].origen_id;
  const [asiento] = await tx.execute(sql`
    INSERT INTO contabilidad_asientos (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
    VALUES (${teamId}, ${entrada.fecha}::date, ${concepto}, ${origenTipo}, ${origenId}, ${debe}, ${userId})
    RETURNING id`) as unknown as { id: number }[];
  let orden = 0;
  for (const l of entrada.lineas) {
    await tx.execute(sql`
      INSERT INTO contabilidad_asiento_lineas (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
      VALUES (${asiento.id}, ${teamId}, ${l.cuentaId}, ${l.debeCents}, ${l.haberCents}, ${(l.descripcion ?? concepto).slice(0, 255)}, ${orden++})`);
  }
  return { asientoId: asiento.id };
}
