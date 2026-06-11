/**
 * Generador del número de cierre de caja: CC-YYYY-NNNNNN.
 *
 * Único por (team, año). Counter por empresa en caja_cierre_counter.
 * UPSERT atómico (INSERT ... ON CONFLICT DO UPDATE RETURNING) para evitar
 * colisiones en cierres concurrentes. Mismo patrón que generarCodigoFactura.
 */

import { sql } from 'drizzle-orm';
import type { db as DbType } from '@/lib/db/drizzle';

type Executor = typeof DbType;

export async function generarNumeroCierre(
  executor: Executor,
  teamId: number,
  fecha: Date = new Date(),
): Promise<string> {
  const anio = fecha.getFullYear();

  const rows = await executor.execute(sql`
    INSERT INTO caja_cierre_counter (team_id, anio, ultimo)
      VALUES (${teamId}, ${anio}, 1)
    ON CONFLICT (team_id, anio)
      DO UPDATE SET ultimo = caja_cierre_counter.ultimo + 1
    RETURNING ultimo
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = rows;
  const ultimo: number = (r.rows?.[0]?.ultimo ?? r[0]?.ultimo) as number;
  if (!ultimo || typeof ultimo !== 'number') {
    throw new Error('No se pudo generar el número de cierre — counter sin valor');
  }

  return `CC-${anio}-${String(ultimo).padStart(6, '0')}`;
}
