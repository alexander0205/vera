/**
 * Generador de código humano-legible para facturas: F-YYYY-NNNNNN.
 *
 * Único por (team, año). Counter por empresa en tabla factura_codigo_counter.
 * Transaccional: usa INSERT ... ON CONFLICT DO UPDATE RETURNING para evitar race
 * de doble-emisión cuando dos requests pegan al mismo tiempo.
 *
 * Uso típico:
 *   const codigo = await generarCodigoFactura(db, teamId);
 *   // → "F-2026-000042"
 *
 * Si pasas una transacción (tx) en lugar de db global, el counter se incrementa
 * dentro de la misma tx y rollback restaura el estado.
 */

import { sql } from 'drizzle-orm';
import type { db as DbType } from '@/lib/db/drizzle';

type Executor = typeof DbType;

export async function generarCodigoFactura(
  executor: Executor,
  teamId: number,
  fecha: Date = new Date(),
): Promise<string> {
  const anio = fecha.getFullYear();

  // UPSERT atómico: si la fila (team, anio) existe → +1, si no → crear con ultimo=1.
  const rows = await executor.execute(sql`
    INSERT INTO factura_codigo_counter (team_id, anio, ultimo)
      VALUES (${teamId}, ${anio}, 1)
    ON CONFLICT (team_id, anio)
      DO UPDATE SET ultimo = factura_codigo_counter.ultimo + 1
    RETURNING ultimo
  `);

  // drizzle.execute() devuelve { rows: [...] } para neon-http, o el array directo
  // para otros drivers — normalizar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = rows;
  const ultimo: number = (r.rows?.[0]?.ultimo ?? r[0]?.ultimo) as number;
  if (!ultimo || typeof ultimo !== 'number') {
    throw new Error('No se pudo generar el código de factura — counter sin valor');
  }

  return `F-${anio}-${String(ultimo).padStart(6, '0')}`;
}
