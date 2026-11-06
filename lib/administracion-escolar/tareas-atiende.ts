/**
 * lib/administracion-escolar/tareas-atiende.ts — qué persona del equipo de Zero
 * atiende cada tarea de Soporte (tabla de la migración 0237).
 *
 * Todo falla cerrado: si la tabla no existe todavía, las lecturas devuelven
 * vacío (nadie atiende nada) y el registro no hace nada; las tareas siguen
 * funcionando como antes. Nunca lanza, y nunca va dentro de la transacción de
 * una tarea (un error de tabla faltante la abortaría).
 */
import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTareaAtiende, users } from '@/lib/db/schema';
import { perfilesDelEquipo } from '@/lib/auth/equipo-zero-perfil';
import { armarPersonaEquipo, type PersonaEquipo } from './tareas-equipo';

/** Quién atiende cada tarea: `tareaId` → `userId`. */
export async function atiendeDe(tareaIds: number[]): Promise<Map<number, number>> {
  if (tareaIds.length === 0) return new Map();
  try {
    const filas = await db.select({ tareaId: adminEscolarTareaAtiende.tareaId, userId: adminEscolarTareaAtiende.userId })
      .from(adminEscolarTareaAtiende).where(inArray(adminEscolarTareaAtiende.tareaId, tareaIds));
    return new Map(filas.map((f) => [f.tareaId, f.userId]));
  } catch (e) {
    console.error('[tareas] no se pudo leer quién atiende:', e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Las tareas que atiende una persona; `null` si no se pudo leer (el filtro entonces no enseña nada). */
export async function tareasQueAtiende(userId: number): Promise<number[] | null> {
  try {
    const filas = await db.select({ tareaId: adminEscolarTareaAtiende.tareaId })
      .from(adminEscolarTareaAtiende).where(eq(adminEscolarTareaAtiende.userId, userId));
    return filas.map((f) => f.tareaId);
  } catch (e) {
    console.error('[tareas] no se pudo leer las tareas de una persona:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Las personas del equipo con nombre, cargo y foto, para enseñarlas. Solo
 * cuentas que hoy son del equipo (administradores de plataforma, no borradas);
 * se lee el nombre y nada más de `users`: el correo no sale de aquí.
 */
export async function personasDelEquipo(userIds: number[]): Promise<Map<number, PersonaEquipo>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  try {
    const filas = await db.select({ id: users.id, name: users.name }).from(users)
      .where(and(inArray(users.id, ids), eq(users.platformRole, 'admin'), isNull(users.deletedAt)));
    const perfiles = await perfilesDelEquipo(filas.map((f) => f.id));
    const personas = new Map<number, PersonaEquipo>();
    for (const f of filas) {
      const perfil = perfiles.get(f.id);
      const p = armarPersonaEquipo({ userId: f.id, name: f.name, cargo: perfil?.cargo, fotoVersion: perfil?.fotoVersion });
      if (p) personas.set(f.id, p);
    }
    return personas;
  } catch (e) {
    console.error('[tareas] no se pudo leer al equipo:', e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** La persona que atiende cada tarea, lista para enseñar. */
export async function atiendenLasTareas(tareaIds: number[]): Promise<Map<number, PersonaEquipo>> {
  const atiende = await atiendeDe(tareaIds);
  const personas = await personasDelEquipo([...atiende.values()]);
  const r = new Map<number, PersonaEquipo>();
  for (const [tareaId, userId] of atiende) {
    const p = personas.get(userId);
    if (p) r.set(tareaId, p);
  }
  return r;
}

/** Deja anotado que esta persona del equipo atiende la tarea. Nunca lanza. */
export async function registrarAtiende(tareaId: number, userId: number | null): Promise<void> {
  if (userId == null) return;
  try {
    await db.insert(adminEscolarTareaAtiende).values({ tareaId, userId })
      .onConflictDoUpdate({
        target: adminEscolarTareaAtiende.tareaId,
        set: { userId, actualizadoEn: sql`now()` },
      });
  } catch (e) {
    console.error('[tareas] no se pudo anotar quién atiende', tareaId, e instanceof Error ? e.message : e);
  }
}
