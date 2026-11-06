/**
 * Avisar al equipo de Zero, en la campana del panel y en su celular, de lo que
 * pasa en las tareas de los colegios que le tocan a Soporte.
 *
 * Reusa la tabla `notificaciones`: una fila por administrador, con `team_id` =
 * el colegio de la tarea y `user_id` = el administrador (son PERSONALES). La
 * campana del panel (`/api/admin/notificaciones`) las lee por `user_id` en
 * todas las empresas, y su marca de leído es propia (`notificaciones_plataforma_leidas`).
 *
 * El correo a Soporte y el mensaje al canal de Slack ya salen desde
 * `avisarDeTarea`; esto es el tercer camino, dentro del sistema.
 *
 * REGLA DEL DUEÑO: las tareas no se mandan por WhatsApp, de ningún colegio.
 * Este archivo no importa nada de WhatsApp y no debe: hay una prueba que lo
 * vigila (tests/unit/admin-tareas-notificaciones.test.ts).
 *
 * Nunca lanza: la tarea ya quedó guardada y un aviso que no sale no la deshace.
 */

import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notificaciones, users } from '@/lib/db/schema';
import { empujarA } from './push';
import { notificacionDeTareaParaZero } from './plataforma-texto';
import type { DatosTarea } from './texto';

export async function notificarEquipoZeroDeTarea(
  teamId: number,
  d: DatosTarea,
  colegio: string | null,
  opts: {
    /** Quien hizo el cambio, si es del equipo: no se avisa a sí mismo. */
    autorUserId: number | null;
    /** Los que ya recibieron el aviso del colegio (un admin que participó en la tarea): no se les repite. */
    yaAvisados: readonly number[];
    /** Solo a estas personas del equipo, en vez de a todos (la alerta a quien tomó la tarea). */
    soloA?: readonly number[];
  },
): Promise<number> {
  try {
    const admins = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.platformRole, 'admin'), isNull(users.deletedAt)));
    const omitir = new Set<number>(opts.yaAvisados);
    if (opts.autorUserId != null) omitir.add(opts.autorUserId);
    const solo = opts.soloA ? new Set<number>(opts.soloA) : null;
    const para = admins.map((a) => a.id).filter((id) => !omitir.has(id) && (!solo || solo.has(id)));
    if (para.length === 0) return 0;

    const n = notificacionDeTareaParaZero(d, colegio);
    await db.insert(notificaciones).values(para.map((userId) => ({
      teamId, userId, tipo: 'tarea', titulo: n.titulo, detalle: n.detalle, enlace: n.enlace,
    })));
    await empujarA(para, {
      title: n.titulo,
      body: n.detalle,
      url: n.enlace,
      // La misma tarea reemplaza su aviso anterior en el celular en vez de apilarlos.
      tag: `zero-tarea-${d.tareaId}`,
    });
    return para.length;
  } catch (e) {
    console.error('[notificaciones] equipo Zero, tarea:', d.tareaId, e instanceof Error ? e.message : e);
    return 0;
  }
}
