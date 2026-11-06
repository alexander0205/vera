/**
 * Mencionar a una persona con «@» en una tarea le manda un aviso a SU campana
 * (una fila personal en `notificaciones`, igual que los demás avisos de tareas).
 * Nunca lanza: el mensaje ya quedó guardado.
 */
import 'server-only';
import { db } from '@/lib/db/drizzle';
import { eq } from 'drizzle-orm';
import { notificaciones, teams } from '@/lib/db/schema';
import { enlaceDeTarea } from './texto';
import { enlaceDeTareaEnPanel } from './plataforma-texto';

export async function notificarMenciones(
  teamId: number,
  personas: readonly { id: number; zero: boolean }[],
  d: { tareaId: number; titulo: string; autor: string; texto: string; autorUserId: number | null },
  colegio: string | null,
): Promise<void> {
  try {
    const vistas = new Set<number>();
    const para = personas.filter((p) => p.id !== d.autorUserId && !vistas.has(p.id) && vistas.add(p.id));
    if (para.length === 0) return;
    // El panel del equipo de Zero mezcla colegios: a ellos se les dice de cuál es.
    const nombreColegio = colegio ?? (para.some((p) => p.zero)
      ? (await db.select({ n: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1))[0]?.n ?? null
      : null);
    const texto = d.texto.length > 200 ? `${d.texto.slice(0, 199).trimEnd()}…` : d.texto;
    await db.insert(notificaciones).values(para.map((p) => ({
      teamId, userId: p.id, tipo: 'tarea',
      titulo: `${d.autor} te mencionó en una tarea`.slice(0, 160),
      detalle: [p.zero ? nombreColegio : null, `${d.titulo}: ${texto}`].filter(Boolean).join(' · ').slice(0, 280),
      // El equipo de Zero lee las tareas en su panel; el colegio, en «Tareas».
      enlace: p.zero ? enlaceDeTareaEnPanel(d.tareaId) : enlaceDeTarea(d.tareaId),
    })));
  } catch (e) {
    console.error('[notificaciones] menciones, tarea:', d.tareaId, e instanceof Error ? e.message : e);
  }
}
