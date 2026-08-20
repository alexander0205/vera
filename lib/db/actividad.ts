/**
 * La bitácora de actividad.
 *
 * Vivía dentro de `app/(login)/actions.ts`, que lleva `'use server'` y por eso
 * no la podía exportar: cualquier otro sitio que quisiera apuntar algo tenía
 * que escribir su propio insert. Aquí la puede usar todo el mundo.
 */

import { db } from '@/lib/db/drizzle';
import { activityLogs, type ActivityType, type NewActivityLog } from '@/lib/db/schema';

/**
 * Apunta una acción.
 *
 * Sin equipo no se apunta nada y no se lanza: hay altas —la de Google, sin ir
 * más lejos— donde el equipo se resuelve después, y hacer que la bitácora
 * tumbe un registro que por lo demás salió bien sería cambiar un renglón
 * perdido por una cuenta perdida.
 */
export async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string,
) {
  if (teamId === null || teamId === undefined) return;

  const fila: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || '',
  };
  await db.insert(activityLogs).values(fila);
}
