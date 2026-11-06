/**
 * lib/administracion-escolar/tareas-atiende.ts — qué persona atiende cada tarea
 * (tabla de la migración 0237; desde la 0241 guarda UNA PERSONA POR LADO: la del
 * equipo de Zero, 'zero', y la del colegio, 'colegio').
 *
 * Lo que enseñan las listas («La atiende: Ana · Soporte») sigue siendo solo el
 * lado de Zero; «Tomar la tarea» usa los dos lados.
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
import { primerNombre, type Lado } from './tareas-reglas';

/** Quién del equipo de Zero atiende cada tarea: `tareaId` → `userId`. */
export async function atiendeDe(tareaIds: number[]): Promise<Map<number, number>> {
  if (tareaIds.length === 0) return new Map();
  try {
    const filas = await db.select({ tareaId: adminEscolarTareaAtiende.tareaId, userId: adminEscolarTareaAtiende.userId })
      .from(adminEscolarTareaAtiende)
      .where(and(inArray(adminEscolarTareaAtiende.tareaId, tareaIds), eq(adminEscolarTareaAtiende.lado, 'zero')));
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
      .from(adminEscolarTareaAtiende)
      .where(and(eq(adminEscolarTareaAtiende.userId, userId), eq(adminEscolarTareaAtiende.lado, 'zero')));
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

/** Deja anotado que esta persona atiende la tarea por su lado (por defecto el de Zero). Nunca lanza. */
export async function registrarAtiende(tareaId: number, userId: number | null, lado: Lado = 'zero'): Promise<void> {
  if (userId == null) return;
  try {
    await db.insert(adminEscolarTareaAtiende).values({ tareaId, lado, userId })
      .onConflictDoUpdate({
        target: [adminEscolarTareaAtiende.tareaId, adminEscolarTareaAtiende.lado],
        set: { userId, actualizadoEn: sql`now()` },
      });
  } catch (e) {
    console.error('[tareas] no se pudo anotar quién atiende', tareaId, e instanceof Error ? e.message : e);
  }
}

/** Quién tomó la tarea por cada lado, con su primer nombre (el correo no sale de aquí). */
export interface QuienTomo { userId: number; nombre: string }
export type TomadaPor = Record<Lado, QuienTomo | null>;

export async function quienTomo(tareaId: number): Promise<TomadaPor> {
  const vacio: TomadaPor = { colegio: null, zero: null };
  try {
    const filas = await db.select({ lado: adminEscolarTareaAtiende.lado, userId: users.id, name: users.name, email: users.email })
      .from(adminEscolarTareaAtiende)
      .innerJoin(users, eq(users.id, adminEscolarTareaAtiende.userId))
      .where(and(eq(adminEscolarTareaAtiende.tareaId, tareaId), isNull(users.deletedAt)));
    for (const f of filas) {
      if (f.lado === 'colegio' || f.lado === 'zero') vacio[f.lado] = { userId: f.userId, nombre: primerNombre(f.name) ?? 'Alguien' };
    }
  } catch (e) {
    console.error('[tareas] no se pudo leer quién tomó la tarea:', e instanceof Error ? e.message : e);
  }
  return vacio;
}

/**
 * «Tomar la tarea» por un lado. `nueva`: nadie de ese lado la tenía y ahora es
 * de esta persona. `ya_suya`: ya la había tomado ella. `ocupada`: la tomó otra
 * persona de ese lado antes (no se la quita). Lanza si la base falla: es una
 * acción pedida.
 */
export async function tomarPorLado(tareaId: number, userId: number, lado: Lado): Promise<'nueva' | 'ya_suya' | 'ocupada'> {
  const [nueva] = await db.insert(adminEscolarTareaAtiende).values({ tareaId, lado, userId })
    .onConflictDoNothing().returning({ userId: adminEscolarTareaAtiende.userId });
  if (nueva) return 'nueva';
  const [actual] = await db.select({ userId: adminEscolarTareaAtiende.userId }).from(adminEscolarTareaAtiende)
    .where(and(eq(adminEscolarTareaAtiende.tareaId, tareaId), eq(adminEscolarTareaAtiende.lado, lado))).limit(1);
  return actual?.userId === userId ? 'ya_suya' : 'ocupada';
}
