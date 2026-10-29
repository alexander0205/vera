/**
 * Lo que pasa en una tarea por revisar, en la campana de cada persona y en su
 * celular: le respondieron, le subieron un archivo, la pasaron a revisión, la
 * completaron. El correo ya salía (lib/email/escolar-tareas.ts); esto es el
 * mismo aviso DENTRO del sistema, para quien no vive en el correo.
 *
 * Es PERSONAL: una fila por persona (`user_id`), a las mismas que avisa el
 * correo (`aQuienAvisar`). Nunca lanza.
 */

import 'server-only';
import { db } from '@/lib/db/drizzle';
import { notificaciones } from '@/lib/db/schema';
import { empujarA } from './push';
import { notificacionDeTarea, type DatosTarea } from './texto';

export async function notificarTarea(
  teamId: number, userIds: readonly number[], d: DatosTarea, colegio: string | null,
): Promise<void> {
  try {
    const para = [...new Set(userIds)];
    if (para.length === 0) return;
    const n = notificacionDeTarea(d);
    await db.insert(notificaciones).values(para.map((userId) => ({
      teamId, userId, tipo: 'tarea', titulo: n.titulo, detalle: n.detalle, enlace: n.enlace,
    })));
    await empujarA(para, {
      title: n.titulo,
      body: colegio ? `${colegio} · ${n.detalle}` : n.detalle,
      url: n.enlace,
      // La misma tarea reemplaza su aviso anterior en el celular en vez de apilarlos.
      tag: `tarea-${d.tareaId}`,
    });
  } catch (e) {
    console.error('[notificaciones] tarea:', d.tareaId, e instanceof Error ? e.message : e);
  }
}
