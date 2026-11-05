/**
 * La foto y el cargo del equipo de Zero en la base (migración 0218). Las reglas
 * puras están en `equipo-zero-perfil-reglas.ts`.
 *
 * Si la tabla no existe todavía, las lecturas devuelven vacío (nadie tiene foto
 * ni cargo) y la escritura contesta que falta la migración: nada se rompe.
 */

import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { auditLogs, equipoZeroPerfiles, platformOwners, users } from '@/lib/db/schema';
import { puedeEditarPerfil, type TipoFoto } from './equipo-zero-perfil-reglas';

export interface PerfilEquipo {
  cargo: string | null;
  /** Versión de la foto si hay foto; `null` si no tiene. */
  fotoVersion: number | null;
}

const esTablaFaltante = (e: unknown) =>
  (e as { code?: string; cause?: { code?: string } })?.code === '42P01'
  || (e as { cause?: { code?: string } })?.cause?.code === '42P01';

/** Cargo y versión de foto de cada id. Sin la tabla (0218 sin correr), vacío. */
export async function perfilesDelEquipo(ids: number[]): Promise<Map<number, PerfilEquipo>> {
  if (ids.length === 0) return new Map();
  try {
    const filas = await db.select({
      userId: equipoZeroPerfiles.userId,
      cargo: equipoZeroPerfiles.cargo,
      fotoVersion: equipoZeroPerfiles.fotoVersion,
      tieneFoto: sql<boolean>`${equipoZeroPerfiles.foto} is not null`,
    }).from(equipoZeroPerfiles).where(inArray(equipoZeroPerfiles.userId, ids));
    return new Map(filas.map((f) => [f.userId, { cargo: f.cargo, fotoVersion: f.tieneFoto ? f.fotoVersion : null }]));
  } catch (e) {
    console.error('[equipo-zero] no se pudo leer equipo_zero_perfiles:', e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** La foto de una persona del equipo, o `null` si no tiene (o falta la tabla). */
export async function leerFotoEquipo(userId: number): Promise<{ foto: Buffer; tipo: string; version: number } | null> {
  try {
    const [f] = await db.select({
      foto: equipoZeroPerfiles.foto, tipo: equipoZeroPerfiles.fotoTipo, version: equipoZeroPerfiles.fotoVersion,
    }).from(equipoZeroPerfiles).where(eq(equipoZeroPerfiles.userId, userId)).limit(1);
    if (!f?.foto || !f.tipo) return null;
    return { foto: f.foto, tipo: f.tipo, version: f.version };
  } catch (e) {
    console.error('[equipo-zero] no se pudo leer la foto:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface DatosPerfil {
  actorId: number;
  objetivoId: number;
  /** `undefined` = no cambiar; `null` = quitar el cargo. */
  cargo?: string | null;
  /** `undefined` = no cambiar; `null` = quitar la foto. */
  foto?: { bytes: Buffer; tipo: TipoFoto } | null;
  ip: string | null;
}

export type ResultadoPerfil =
  | { ok: true; perfil: PerfilEquipo }
  | { ok: false; status: number; mensaje: string };

/**
 * Cambia la foto y/o el cargo. Dentro de una transacción vuelve a leer quién
 * pide el cambio (el rol pudo cambiar desde que empezó la petición), comprueba
 * que el objetivo siga siendo administrador y deja la auditoría en la misma
 * transacción.
 */
export async function guardarPerfil(d: DatosPerfil): Promise<ResultadoPerfil> {
  if (d.cargo === undefined && d.foto === undefined) return { ok: false, status: 400, mensaje: 'No hay nada que cambiar.' };
  try {
    return await db.transaction(async (tx) => {
      const [actor] = await tx.select({ id: users.id, email: users.email }).from(users)
        .where(and(eq(users.id, d.actorId), eq(users.platformRole, 'admin'), isNull(users.deletedAt))).limit(1);
      if (!actor) return { ok: false as const, status: 403, mensaje: 'Ya no tienes acceso de administrador.' };
      const [dueno] = await tx.select({ userId: platformOwners.userId }).from(platformOwners)
        .where(eq(platformOwners.userId, actor.id)).limit(1);
      if (!puedeEditarPerfil({ id: actor.id, esDueno: !!dueno }, d.objetivoId)) {
        return { ok: false as const, status: 403, mensaje: 'Solo la propia persona o el dueño de la plataforma pueden cambiar esto.' };
      }
      const [objetivo] = await tx.select({ id: users.id, email: users.email }).from(users)
        .where(and(eq(users.id, d.objetivoId), eq(users.platformRole, 'admin'), isNull(users.deletedAt))).limit(1);
      if (!objetivo) return { ok: false as const, status: 404, mensaje: 'Esa cuenta no es del equipo de Zero.' };

      const cambios: Partial<typeof equipoZeroPerfiles.$inferInsert> = { actualizadoEn: new Date(), actualizadoPor: actor.id };
      if (d.cargo !== undefined) cambios.cargo = d.cargo;
      if (d.foto !== undefined) {
        cambios.foto = d.foto?.bytes ?? null;
        cambios.fotoTipo = d.foto?.tipo ?? null;
      }
      const subirVersion = d.foto ? sql`${equipoZeroPerfiles.fotoVersion} + 1` : equipoZeroPerfiles.fotoVersion;
      const [f] = await tx.insert(equipoZeroPerfiles)
        .values({ userId: objetivo.id, ...cambios, fotoVersion: d.foto ? 1 : 0 })
        .onConflictDoUpdate({ target: equipoZeroPerfiles.userId, set: { ...cambios, fotoVersion: subirVersion } })
        .returning({
          cargo: equipoZeroPerfiles.cargo,
          fotoVersion: equipoZeroPerfiles.fotoVersion,
          tieneFoto: sql<boolean>`${equipoZeroPerfiles.foto} is not null`,
        });

      await tx.insert(auditLogs).values({
        teamId: null, userId: actor.id, actor: actor.email, action: 'ADMIN_PLATAFORMA_PERFIL',
        resource: `user:${objetivo.id}`, ipAddress: d.ip ? d.ip.slice(0, 45) : null,
        metadata: JSON.stringify({
          objetivo: { id: objetivo.id, email: objetivo.email },
          cargo: d.cargo === undefined ? 'sin cambio' : d.cargo,
          foto: d.foto === undefined ? 'sin cambio' : d.foto ? 'nueva' : 'quitada',
        }),
      });
      return { ok: true as const, perfil: { cargo: f.cargo, fotoVersion: f.tieneFoto ? f.fotoVersion : null } };
    });
  } catch (e) {
    if (esTablaFaltante(e)) return { ok: false, status: 503, mensaje: 'Falta correr la migración 0218 en esta base.' };
    console.error('[equipo-zero] no se pudo guardar el perfil:', e instanceof Error ? e.message : e);
    return { ok: false, status: 500, mensaje: 'No se pudo guardar. Intenta de nuevo.' };
  }
}
