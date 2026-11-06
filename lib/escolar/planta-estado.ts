/**
 * Estado de la planta física de una empresa: ¿están las migraciones?, ¿hay espacios?,
 * ¿hay activos con aula? Es lo que decide si el menú de Gobernanza enseña
 * «Inventario por aula» y si la configuración enseña «Planta física».
 *
 * Falla CERRADO: si algo no está o la lectura revienta (típicamente, código
 * desplegado antes de correr la migración 0236 o la 0225), no se muestra nada y
 * ninguna pantalla existente se rompe. Se lee en cada carga del colegio, así que
 * va en caché por empresa y se invalida al cambiar espacios o activos.
 */

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { inventarioAulaDisponible } from '@/lib/contabilidad/activos-espacios';
import { cachearPorTag, tagPlanta } from '@/lib/cache/escolar';
import type { EstadoPlanta } from './inventario-aula';

export const PLANTA_CERRADA: EstadoPlanta = { disponible: false, espacios: 0, activosConEspacio: 0 };

/** La lectura de verdad. Lanza si la base falla: el llamador decide qué hacer. */
export async function leerEstadoPlanta(teamId: number): Promise<EstadoPlanta> {
  if (!(await inventarioAulaDisponible())) return PLANTA_CERRADA;
  const [f] = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM escolar_espacios WHERE team_id = ${teamId} AND activo) AS espacios,
      (SELECT count(*) FROM contabilidad_activos_fijos a
         JOIN escolar_espacios e ON e.id = a.espacio_id AND e.team_id = a.team_id AND e.activo
        WHERE a.team_id = ${teamId} AND a.activa) AS activos`) as unknown as { espacios: unknown; activos: unknown }[];
  return { disponible: true, espacios: Number(f?.espacios ?? 0), activosConEspacio: Number(f?.activos ?? 0) };
}

/**
 * La lectura con red de seguridad: si falla, la planta queda cerrada. `leer` se
 * puede cambiar para probarlo.
 */
export async function estadoPlantaSeguro(
  teamId: number,
  leer: (teamId: number) => Promise<EstadoPlanta> = leerEstadoPlanta,
): Promise<EstadoPlanta> {
  try {
    return await leer(teamId);
  } catch (err) {
    console.error('[planta] no se pudo leer; no se muestra nada', teamId, err instanceof Error ? err.message : err);
    return PLANTA_CERRADA;
  }
}

/** Lo mismo, en caché por empresa. Un error NO se cachea: se lanza dentro de la caché y se atrapa fuera. */
export function estadoPlantaDe(teamId: number): Promise<EstadoPlanta> {
  return estadoPlantaSeguro(teamId, (id) => cachearPorTag(
    () => leerEstadoPlanta(id),
    ['escolar', 'planta-estado', String(id)],
    [tagPlanta(id)],
    300,
  )());
}
