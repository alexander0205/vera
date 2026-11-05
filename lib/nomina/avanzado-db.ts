/**
 * Lectura y guardado de los valores «Avanzado» de la nómina (capa con BD; la
 * validación vive en `./avanzado`). Sin la migración 0234 o sin fila, todo vale lo
 * de ley y nada se rompe.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { AVANZADO_DEFAULT, completarAvanzado, type AvanzadoNomina } from '@/lib/nomina/avanzado';
import { toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';

export async function leerAvanzado(teamId: number): Promise<AvanzadoNomina> {
  return toleraMigracionPendiente(async () => {
    const filas = await db.execute(sql`SELECT valores FROM nomina_avanzado WHERE team_id = ${teamId}`);
    const f = (filas as unknown as { valores: unknown }[])[0];
    return f ? completarAvanzado(f.valores) : { ...AVANZADO_DEFAULT };
  }, { ...AVANZADO_DEFAULT });
}

/** Guarda los valores completos (ya validados). Lanza si falta la migración: aquí sí hay que avisar. */
export async function guardarAvanzado(teamId: number, userId: number, valores: AvanzadoNomina): Promise<void> {
  await db.execute(sql`
    INSERT INTO nomina_avanzado (team_id, valores, updated_by, updated_at)
    VALUES (${teamId}, ${JSON.stringify(valores)}::jsonb, ${userId}, now())
    ON CONFLICT (team_id) DO UPDATE
      SET valores = EXCLUDED.valores, updated_by = ${userId}, updated_at = now()
  `);
}
