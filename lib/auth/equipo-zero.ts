/**
 * El equipo de Zero en la base: quiénes son los administradores de la
 * plataforma, quién es dueño, y agregar o quitar a uno. Las REGLAS están en
 * `equipo-zero-reglas.ts` (puras); aquí solo se reúnen los datos y se aplican.
 *
 * Todo cambio va dentro de UNA transacción que:
 *   1. bloquea las filas de los admins activos (`FOR UPDATE`, en orden de id),
 *      de modo que dos peticiones a la vez se hacen cola y la segunda ve el
 *      resultado de la primera. Sin esto, dos dueños quitando a dos admins
 *      distintos podían dejar a la plataforma sin ninguno;
 *   2. vuelve a leer quién hace la petición: la sesión se resolvió al empezar
 *      la petición y el rol pudo cambiar mientras tanto;
 *   3. escribe la fila de `audit_logs` EN LA MISMA transacción. Una auditoría
 *      que puede perderse sin avisar no sirve para esto: si no queda registro,
 *      no hay cambio.
 */

import 'server-only';
import { randomBytes } from 'crypto';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { auditLogs, passwordResetTokens, platformOwners, users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/session';
import type { AuditAction } from '@/lib/audit';
import {
  evaluarCambioDeEquipo, metaDeAuditoria,
  type ActorEquipo, type CodigoRechazo, type ObjetivoEquipo,
} from './equipo-zero-reglas';

/**
 * Lo que dura el enlace para poner la contraseña. UNA hora, no 24: este enlace
 * concede acceso a todas las empresas, y quien lo reciba tarde pide otro con
 * «Enviar enlace nuevo». Las invitaciones a una empresa duran 24 h porque
 * dan acceso a una sola.
 */
export const VIGENCIA_ENLACE_HORAS = 1;

/** Llave del candado que serializa TODO cambio del equipo (cualquier número fijo y propio). */
const LLAVE_CANDADO_EQUIPO = 727_021_500;

export type Rechazo = {
  ok: false;
  status: number;
  codigo: CodigoRechazo | 'cuenta_eliminada' | 'error';
  mensaje: string;
};

export interface MiembroEquipo {
  id: number;
  nombre: string | null;
  email: string;
  esDueno: boolean;
  emailVerificado: boolean;
  dosFactores: boolean;
  creadoEn: Date;
  /** Tiene un enlace para crear o cambiar contraseña sin usar y vigente. */
  enlacePendienteHasta: Date | null;
}

/**
 * ¿Es dueño de la plataforma? Falla CERRADO: si la tabla no existe (migración
 * 0216 sin correr) o la consulta falla, nadie es dueño y la pantalla queda en
 * solo lectura.
 */
export async function esDuenoDePlataforma(userId: number): Promise<boolean> {
  try {
    const [f] = await db.select({ userId: platformOwners.userId }).from(platformOwners)
      .where(eq(platformOwners.userId, userId)).limit(1);
    return !!f;
  } catch (e) {
    console.error('[equipo-zero] no se pudo leer platform_owners:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Los administradores activos, con su estado. Ordenados: dueños primero, luego por antigüedad. */
export async function listarEquipo(): Promise<{ miembros: MiembroEquipo[]; migracionPendiente: boolean }> {
  const filas = await db.select({
    id: users.id, nombre: users.name, email: users.email, emailVerificado: users.emailVerified,
    dosFactores: users.twoFactorEnabled, creadoEn: users.createdAt,
  }).from(users)
    .where(and(eq(users.platformRole, 'admin'), isNull(users.deletedAt)))
    .orderBy(asc(users.id));

  let duenos = new Set<number>();
  let migracionPendiente = false;
  try {
    const d = await db.select({ userId: platformOwners.userId }).from(platformOwners);
    duenos = new Set(d.map((x) => x.userId));
  } catch (e) {
    migracionPendiente = true;
    console.error('[equipo-zero] no se pudo leer platform_owners:', e instanceof Error ? e.message : e);
  }

  const ids = filas.map((f) => f.id);
  const enlaces = ids.length === 0 ? [] : await db.select({
    userId: passwordResetTokens.userId,
    hasta: sql<Date>`max(${passwordResetTokens.expiresAt})`,
  }).from(passwordResetTokens)
    .where(and(inArray(passwordResetTokens.userId, ids), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .groupBy(passwordResetTokens.userId);
  const pendiente = new Map(enlaces.map((e) => [e.userId, new Date(e.hasta)]));

  const miembros = filas.map((f): MiembroEquipo => ({
    ...f, esDueno: duenos.has(f.id), enlacePendienteHasta: pendiente.get(f.id) ?? null,
  })).sort((a, b) => Number(b.esDueno) - Number(a.esDueno) || a.id - b.id);
  return { miembros, migracionPendiente };
}

export interface CuentaEncontrada {
  id: number;
  nombre: string | null;
  email: string;
  esAdmin: boolean;
  /** En cuántas empresas es miembro: una cuenta de cliente no debería recibir acceso a todas. */
  empresas: number;
  /** Ya probó que el correo es suyo. Sin eso no se le puede dar acceso (ver `agregarAdministrador`). */
  verificada: boolean;
}

/**
 * Qué cuenta tiene ese correo, para enseñarlo ANTES de darle acceso de
 * administrador: promover a quien ya es cliente le da lectura y escritura sobre
 * todas las empresas, y quien confirma tiene que ver de quién se trata.
 */
export async function buscarCuenta(email: string): Promise<CuentaEncontrada | null> {
  const [u] = await db.select({
    id: users.id, nombre: users.name, email: users.email, rol: users.platformRole, verificada: users.emailVerified,
    // Nombre de tabla escrito: ver la nota de `nUsuarios` en lib/admin/tablas.ts.
    empresas: sql<number>`(select count(*)::int from team_members tm where tm.user_id = "users"."id")`,
  }).from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
    .orderBy(asc(users.id)).limit(1);
  return u ? { id: u.id, nombre: u.nombre, email: u.email, esAdmin: u.rol === 'admin', empresas: u.empresas, verificada: u.verificada } : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lee a quien hace la petición DENTRO de la transacción, con las filas de admin ya bloqueadas. */
async function actorEnTx(tx: Tx, actorId: number, idsAdmin: number[]): Promise<ActorEquipo & { email: string }> {
  const [u] = await tx.select({ id: users.id, email: users.email }).from(users)
    .where(and(eq(users.id, actorId), isNull(users.deletedAt))).limit(1);
  const [d] = await tx.select({ userId: platformOwners.userId }).from(platformOwners)
    .where(eq(platformOwners.userId, actorId)).limit(1);
  return { id: actorId, email: u?.email ?? '', esAdmin: !!u && idsAdmin.includes(actorId), esDueno: !!d };
}

/**
 * Pone el candado del equipo y devuelve los ids de los admins activos.
 *
 * `FOR UPDATE` solo bloquea las filas que YA son admin: no impide que otra
 * transacción convierta a alguien en admin mientras esta cuenta (en READ
 * COMMITTED esa fila nueva no entra en la lista). El candado asesor de
 * transacción sí: todo cambio del equipo lo toma primero, así que dos cambios
 * nunca corren a la vez, la cuenta es exacta y el orden de los bloqueos de
 * filas deja de poder causar un interbloqueo. Se suelta solo al terminar.
 */
async function bloquearAdmins(tx: Tx): Promise<number[]> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LLAVE_CANDADO_EQUIPO})`);
  const f = await tx.select({ id: users.id }).from(users)
    .where(and(eq(users.platformRole, 'admin'), isNull(users.deletedAt)))
    .orderBy(asc(users.id)).for('update');
  return f.map((x) => x.id);
}

async function auditar(tx: Tx, a: {
  action: AuditAction; actor: { id: number; email: string }; objetivo: { id: number; email: string };
  ip: string | null; meta: Record<string, unknown>;
}) {
  await tx.insert(auditLogs).values({
    teamId: null, userId: a.actor.id, actor: a.actor.email, action: a.action,
    resource: `user:${a.objetivo.id}`, ipAddress: a.ip ? a.ip.slice(0, 45) : null,
    metadata: JSON.stringify(a.meta),
  });
}

const rechazo = (status: number, codigo: Rechazo['codigo'], mensaje: string): Rechazo =>
  ({ ok: false, status, codigo, mensaje });

export interface DatosAgregar {
  actorId: number;
  email: string;
  nombre: string | null;
  confirmado: boolean;
  ip: string | null;
}
export type ResultadoAgregar =
  | { ok: true; cuentaNueva: boolean; objetivo: { id: number; email: string; nombre: string | null }; token: string | null }
  | Rechazo;

/**
 * Da acceso de administrador a un correo. Si la cuenta existe, se promueve; si
 * no, se crea con una contraseña aleatoria que nadie conoce y un enlace de un
 * solo uso (`password_reset_tokens`) para que la persona ponga la suya. El
 * enlace se devuelve aquí para que quien llama lo mande por correo DESPUÉS de
 * confirmar la transacción; nunca viaja en la respuesta HTTP.
 */
export async function agregarAdministrador(d: DatosAgregar): Promise<ResultadoAgregar> {
  // El hash es lento a propósito: se hace antes de abrir la transacción para no
  // tener bloqueadas las filas de admin mientras tanto.
  const hashInservible = await hashPassword(randomBytes(32).toString('hex'));
  const token = randomBytes(32).toString('hex');

  try {
    return await db.transaction(async (tx): Promise<ResultadoAgregar> => {
      const idsAdmin = await bloquearAdmins(tx);
      const actor = await actorEnTx(tx, d.actorId, idsAdmin);

      const [existente] = await tx.select({
        id: users.id, email: users.email, nombre: users.name, borrado: users.deletedAt, rol: users.platformRole,
        verificada: users.emailVerified,
      }).from(users)
        // Sin distinguir mayúsculas: hay cuentas históricas con el correo como lo escribieron,
        // y una búsqueda exacta crearía un duplicado en vez de promover la que ya existe.
        .where(sql`lower(${users.email}) = ${d.email}`).orderBy(asc(users.id)).for('update').limit(1);

      const objetivo: ObjetivoEquipo | null = existente
        ? { id: existente.id, esAdmin: existente.rol === 'admin', esDueno: false, verificado: existente.verificada } : null;
      const v = evaluarCambioDeEquipo({
        accion: 'agregar', actor, objetivo, confirmado: d.confirmado, adminsActivos: idsAdmin.length,
      });
      if (!v.ok) return rechazo(v.status, v.codigo, v.mensaje);
      // Después de las reglas de quién puede: a quien no puede no se le cuenta nada de las cuentas.
      if (existente?.borrado) return rechazo(409, 'cuenta_eliminada', 'Esa cuenta fue eliminada. Usa otro correo.');

      let id: number;
      let nombre: string | null;
      let cuentaNueva = false;
      if (existente) {
        id = existente.id;
        nombre = existente.nombre;
        await tx.update(users).set({ platformRole: 'admin', updatedAt: new Date() }).where(eq(users.id, id));
      } else {
        cuentaNueva = true;
        nombre = d.nombre;
        const [creado] = await tx.insert(users).values({
          name: d.nombre, email: d.email, passwordHash: hashInservible, platformRole: 'admin',
          // Sin verificar hasta que la persona use el enlace que le llega: ahí
          // (api/auth/reset-password) queda probado que el correo es suyo.
          emailVerified: false,
        }).returning({ id: users.id });
        id = creado.id;
        await tx.insert(passwordResetTokens).values({
          userId: id, token, expiresAt: new Date(Date.now() + VIGENCIA_ENLACE_HORAS * 3_600_000),
        });
      }

      await auditar(tx, {
        action: cuentaNueva ? 'ADMIN_PLATAFORMA_INVITADO' : 'ADMIN_PLATAFORMA_AGREGADO',
        actor, objetivo: { id, email: d.email }, ip: d.ip,
        meta: metaDeAuditoria({
          accion: 'agregar', actor: { id: actor.id, email: actor.email }, objetivo: { id, email: d.email },
          cuentaNueva, adminsDespues: idsAdmin.length + 1,
        }),
      });
      return { ok: true, cuentaNueva, objetivo: { id, email: d.email, nombre }, token: cuentaNueva ? token : null };
    });
  } catch (e) {
    console.error('[equipo-zero] agregar:', e instanceof Error ? e.message : e);
    return rechazo(500, 'error', 'No se pudo completar el cambio. Intenta de nuevo.');
  }
}

export interface DatosQuitar {
  actorId: number;
  objetivoId: number;
  confirmado: boolean;
  ip: string | null;
}
export type ResultadoQuitar =
  | { ok: true; objetivo: { id: number; email: string }; adminsDespues: number }
  | Rechazo;

/**
 * Quita el acceso de administrador (la cuenta se queda, como 'member'). Los
 * enlaces de acceso sin usar de esa cuenta se anulan: si era una invitación que
 * nadie abrió, que ya no sirva.
 */
export async function quitarAdministrador(d: DatosQuitar): Promise<ResultadoQuitar> {
  try {
    return await db.transaction(async (tx): Promise<ResultadoQuitar> => {
      const idsAdmin = await bloquearAdmins(tx);
      const actor = await actorEnTx(tx, d.actorId, idsAdmin);

      const [u] = await tx.select({ id: users.id, email: users.email }).from(users)
        .where(and(eq(users.id, d.objetivoId), isNull(users.deletedAt))).limit(1);
      const [dueno] = u
        ? await tx.select({ userId: platformOwners.userId }).from(platformOwners).where(eq(platformOwners.userId, u.id)).limit(1)
        : [];
      const objetivo: ObjetivoEquipo | null = u
        ? { id: u.id, esAdmin: idsAdmin.includes(u.id), esDueno: !!dueno, verificado: true } : null;

      const v = evaluarCambioDeEquipo({
        accion: 'quitar', actor, objetivo, confirmado: d.confirmado, adminsActivos: idsAdmin.length,
      });
      if (!v.ok) return rechazo(v.status, v.codigo, v.mensaje);
      if (!u) return rechazo(409, 'no_es_admin', 'Esa cuenta no es administradora.');

      await tx.update(users).set({ platformRole: 'member', updatedAt: new Date() }).where(eq(users.id, u.id));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, u.id), isNull(passwordResetTokens.usedAt)));

      await auditar(tx, {
        action: 'ADMIN_PLATAFORMA_QUITADO', actor, objetivo: { id: u.id, email: u.email }, ip: d.ip,
        meta: metaDeAuditoria({
          accion: 'quitar', actor: { id: actor.id, email: actor.email }, objetivo: { id: u.id, email: u.email },
          adminsDespues: idsAdmin.length - 1,
        }),
      });
      return { ok: true, objetivo: { id: u.id, email: u.email }, adminsDespues: idsAdmin.length - 1 };
    });
  } catch (e) {
    console.error('[equipo-zero] quitar:', e instanceof Error ? e.message : e);
    return rechazo(500, 'error', 'No se pudo completar el cambio. Intenta de nuevo.');
  }
}

export type ResultadoReenviar =
  | { ok: true; objetivo: { id: number; email: string; nombre: string | null }; token: string }
  | Rechazo;

/** Un enlace nuevo para un admin que no pudo abrir el anterior. Solo el dueño; anula los anteriores. */
export async function nuevoEnlaceDeAcceso(d: { actorId: number; objetivoId: number; ip: string | null }): Promise<ResultadoReenviar> {
  const token = randomBytes(32).toString('hex');
  try {
    return await db.transaction(async (tx): Promise<ResultadoReenviar> => {
      const idsAdmin = await bloquearAdmins(tx);
      const actor = await actorEnTx(tx, d.actorId, idsAdmin);
      if (!actor.esAdmin) return rechazo(403, 'no_admin', 'Acceso restringido a administradores');
      if (!actor.esDueno) return rechazo(403, 'solo_dueno', 'Solo el dueño de la plataforma puede hacer esto.');

      const [u] = await tx.select({ id: users.id, email: users.email, nombre: users.name }).from(users)
        .where(and(eq(users.id, d.objetivoId), isNull(users.deletedAt))).limit(1);
      if (!u || !idsAdmin.includes(u.id)) return rechazo(409, 'no_es_admin', 'Esa cuenta no es administradora.');

      await tx.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, u.id), isNull(passwordResetTokens.usedAt)));
      await tx.insert(passwordResetTokens).values({
        userId: u.id, token, expiresAt: new Date(Date.now() + VIGENCIA_ENLACE_HORAS * 3_600_000),
      });
      await auditar(tx, {
        action: 'ADMIN_PLATAFORMA_ENLACE', actor, objetivo: { id: u.id, email: u.email }, ip: d.ip,
        meta: { accion: 'enlace', actor: { id: actor.id, email: actor.email }, objetivo: { id: u.id, email: u.email } },
      });
      return { ok: true, objetivo: { id: u.id, email: u.email, nombre: u.nombre }, token };
    });
  } catch (e) {
    console.error('[equipo-zero] enlace:', e instanceof Error ? e.message : e);
    return rechazo(500, 'error', 'No se pudo completar el cambio. Intenta de nuevo.');
  }
}
