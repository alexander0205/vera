/**
 * Las consultas de las tablas del panel (`/admin/empresas`, `usuarios`, `logs`,
 * `tareas`): filtro, orden y paginación en la BASE, no en el navegador. Cada
 * tabla trae su definición (`DEF_*`, lo que acepta la URL), su consulta y las
 * columnas de su exportación a CSV.
 *
 * NINGUNA verifica quién pregunta: la compuerta (`exigirAdmin()` en la página,
 * `requirePlatformAdmin()` en la ruta) va ANTES de llamar a estas funciones.
 * Por eso `import 'server-only'` y por eso solo las usan esos dos sitios.
 *
 * Seguridad: el campo de orden sale de una lista blanca (`ORDEN_*`), el texto
 * de búsqueda viaja como parámetro con sus comodines escapados, y a la salida
 * nunca van campos secretos (`passwordHash`, `twoFactorSecret`).
 */

import 'server-only';
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarTareas, systemLogs, teams, users,
} from '@/lib/db/schema';
import { fechaHora } from './fecha';
import {
  armarCsv, patronBusqueda, TOPE_EXPORTACION, type ConsultaTabla, type DefTabla,
} from './consulta-tabla';

const ZONA = 'America/Santo_Domingo';
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const dir = (d: 'asc' | 'desc', e: SQL | typeof teams.id) => (d === 'asc' ? asc(e) : desc(e));

/** Límite y desplazamiento de una consulta; `todo` los quita (solo para exportar, con tope). */
function pagina(c: ConsultaTabla, todo: boolean) {
  return todo ? { limit: TOPE_EXPORTACION, offset: 0 } : { limit: c.tamano, offset: (c.pagina - 1) * c.tamano };
}

// ═══════════════════════════════════════════════════════════════════════════
// Empresas
// ═══════════════════════════════════════════════════════════════════════════

export const DEF_EMPRESAS: DefTabla = {
  ordenables: ['nombre', 'rnc', 'plan', 'usuarios', 'facturas', 'creada'],
  porDefecto: { campo: 'creada', dir: 'desc' },
  filtros: {
    plan: { tipo: 'clave' },
    estado: { tipo: 'clave' },
    modulo: { tipo: 'opciones', opciones: ['escolar', 'pos', 'caja', 'dgii'] },
  },
};

export interface FilaEmpresa {
  id: number;
  nombre: string;
  razonSocial: string | null;
  rnc: string | null;
  plan: string | null;
  estado: string | null;
  usuarios: number;
  facturas: number;
  escolar: boolean;
  pos: boolean;
  caja: boolean;
  dgii: boolean;
  creada: string;
}

// Las subconsultas llevan los nombres de tabla ESCRITOS: en una consulta de una sola tabla drizzle
// quita el prefijo a las columnas (`"id"` en vez de `"teams"."id"`), y dentro de la subconsulta ese `id`
// pasaría a ser el de la tabla de adentro: el conteo saldría siempre en 0.
const nUsuarios = sql<number>`(select count(*)::int from team_members tm where tm.team_id = "teams"."id")`;
const nFacturas = sql<number>`(select count(*)::int from ecf_documents d where d.team_id = "teams"."id")`;

export async function consultarEmpresas(c: ConsultaTabla, todo = false): Promise<{ filas: FilaEmpresa[]; total: number }> {
  const w: (SQL | undefined)[] = [];
  if (c.q) {
    const p = patronBusqueda(c.q);
    w.push(or(ilike(teams.name, p), ilike(teams.razonSocial, p), ilike(teams.rnc, p), ilike(teams.nombreComercial, p)));
  }
  if (c.filtros.plan) w.push(eq(teams.planName, c.filtros.plan));
  if (c.filtros.estado) w.push(eq(teams.subscriptionStatus, c.filtros.estado));
  if (c.filtros.modulo === 'escolar') w.push(eq(teams.posEscolarHabilitado, true));
  if (c.filtros.modulo === 'pos') w.push(eq(teams.posHabilitado, true));
  if (c.filtros.modulo === 'caja') w.push(eq(teams.cajaHabilitada, true));
  if (c.filtros.modulo === 'dgii') w.push(sql`${teams.habilitacionCompletadoAt} is not null`);
  const where = and(...w);

  const orden = {
    nombre: sql`lower(coalesce(${teams.razonSocial}, ${teams.name}))`,
    rnc: sql`${teams.rnc}`,
    plan: sql`${teams.planName}`,
    usuarios: nUsuarios,
    facturas: nFacturas,
    creada: sql`${teams.createdAt}`,
  }[c.orden.campo] ?? sql`${teams.createdAt}`;

  const { limit, offset } = pagina(c, todo);
  const [filas, [{ total }]] = await Promise.all([
    db.select({
      id: teams.id, nombre: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc,
      plan: teams.planName, estado: teams.subscriptionStatus,
      usuarios: nUsuarios, facturas: nFacturas,
      escolar: teams.posEscolarHabilitado, pos: teams.posHabilitado, caja: teams.cajaHabilitada,
      dgiiAt: teams.habilitacionCompletadoAt, creada: teams.createdAt,
    }).from(teams).where(where)
      .orderBy(dir(c.orden.dir, orden as SQL), desc(teams.id)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(teams).where(where),
  ]);
  return {
    total,
    filas: filas.map((f) => ({
      id: f.id, nombre: f.razonSocial ?? f.nombre, razonSocial: f.razonSocial && f.razonSocial !== f.nombre ? f.nombre : null,
      rnc: f.rnc, plan: f.plan, estado: f.estado, usuarios: f.usuarios, facturas: f.facturas,
      escolar: f.escolar, pos: f.pos, caja: f.caja, dgii: !!f.dgiiAt, creada: iso(f.creada)!,
    })),
  };
}

/** Los planes y estados que existen, para los selectores del filtro. */
export async function opcionesDeEmpresas() {
  const [planes, estados] = await Promise.all([
    db.selectDistinct({ v: teams.planName }).from(teams).where(sql`${teams.planName} is not null`).orderBy(asc(teams.planName)),
    db.selectDistinct({ v: teams.subscriptionStatus }).from(teams).where(sql`${teams.subscriptionStatus} is not null`).orderBy(asc(teams.subscriptionStatus)),
  ]);
  return { planes: planes.map((p) => p.v!).filter(Boolean), estados: estados.map((p) => p.v!).filter(Boolean) };
}

const fechaDR = (iso: string | null) => (iso ? fechaHora(iso) : '');

export function csvEmpresas(filas: FilaEmpresa[]) {
  return armarCsv(
    ['ID', 'Empresa', 'Nombre interno', 'RNC', 'Plan', 'Estado', 'Usuarios', 'Facturas', 'POS escolar', 'POS', 'Caja', 'Habilitada DGII', 'Creada'],
    filas.map((f) => [f.id, f.nombre, f.razonSocial ?? '', f.rnc ?? '', f.plan ?? '', f.estado ?? '', f.usuarios, f.facturas,
      f.escolar ? 'Sí' : 'No', f.pos ? 'Sí' : 'No', f.caja ? 'Sí' : 'No', f.dgii ? 'Sí' : 'No', fechaDR(f.creada)]),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Usuarios
// ═══════════════════════════════════════════════════════════════════════════

export const DEF_USUARIOS: DefTabla = {
  ordenables: ['nombre', 'email', 'rol', 'empresas', 'creado'],
  porDefecto: { campo: 'creado', dir: 'desc' },
  filtros: {
    rol: { tipo: 'opciones', opciones: ['admin', 'member'] },
    verificado: { tipo: 'opciones', opciones: ['si', 'no'] },
    dosfa: { tipo: 'opciones', opciones: ['si', 'no'] },
  },
};

export interface FilaUsuario {
  id: number;
  nombre: string | null;
  email: string;
  admin: boolean;
  empresas: number;
  verificado: boolean;
  dosFactores: boolean;
  creado: string;
}

const nEmpresasDe = sql<number>`(select count(*)::int from team_members tm where tm.user_id = "users"."id")`;

export async function consultarUsuarios(c: ConsultaTabla, todo = false): Promise<{ filas: FilaUsuario[]; total: number }> {
  const w: (SQL | undefined)[] = [isNull(users.deletedAt)];
  if (c.q) {
    const p = patronBusqueda(c.q);
    w.push(or(ilike(users.name, p), ilike(users.email, p)));
  }
  if (c.filtros.rol) w.push(eq(users.platformRole, c.filtros.rol));
  if (c.filtros.verificado) w.push(eq(users.emailVerified, c.filtros.verificado === 'si'));
  if (c.filtros.dosfa) w.push(eq(users.twoFactorEnabled, c.filtros.dosfa === 'si'));
  const where = and(...w);

  const orden = {
    nombre: sql`lower(${users.name})`,
    email: sql`lower(${users.email})`,
    rol: sql`${users.platformRole}`,
    empresas: nEmpresasDe,
    creado: sql`${users.createdAt}`,
  }[c.orden.campo] ?? sql`${users.createdAt}`;

  const { limit, offset } = pagina(c, todo);
  const [filas, [{ total }]] = await Promise.all([
    db.select({
      id: users.id, nombre: users.name, email: users.email, rol: users.platformRole,
      verificado: users.emailVerified, dosFactores: users.twoFactorEnabled, creado: users.createdAt,
      empresas: nEmpresasDe,
    }).from(users).where(where)
      .orderBy(dir(c.orden.dir, orden as SQL), desc(users.id)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);
  return {
    total,
    filas: filas.map((f) => ({
      id: f.id, nombre: f.nombre, email: f.email, admin: f.rol === 'admin', empresas: f.empresas,
      verificado: f.verificado, dosFactores: f.dosFactores, creado: iso(f.creado)!,
    })),
  };
}

export function csvUsuarios(filas: FilaUsuario[]) {
  return armarCsv(
    ['ID', 'Nombre', 'Correo', 'Rol', 'Empresas', 'Correo verificado', '2FA', 'Registrado'],
    filas.map((f) => [f.id, f.nombre ?? '', f.email, f.admin ? 'Administrador' : 'Usuario', f.empresas,
      f.verificado ? 'Sí' : 'No', f.dosFactores ? 'Sí' : 'No', fechaDR(f.creado)]),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Logs del sistema
// ═══════════════════════════════════════════════════════════════════════════

export const DEF_LOGS: DefTabla = {
  ordenables: ['fecha', 'nivel', 'origen', 'empresa'],
  porDefecto: { campo: 'fecha', dir: 'desc' },
  filtros: {
    nivel: { tipo: 'opciones', opciones: ['error', 'warn', 'info'] },
    empresa: { tipo: 'entero' },
    desde: { tipo: 'fecha' },
    hasta: { tipo: 'fecha' },
  },
};

export interface FilaLog {
  id: number;
  nivel: string;
  origen: string | null;
  mensaje: string;
  detalle: string | null;
  empresaId: number | null;
  empresa: string | null;
  fecha: string;
}

/** Cuánto del detalle viaja a la pantalla: hay logs con un volcado entero. */
const LARGO_DETALLE = 4000;

export async function consultarLogs(c: ConsultaTabla, todo = false): Promise<{ filas: FilaLog[]; total: number }> {
  const w: (SQL | undefined)[] = [];
  if (c.q) {
    const p = patronBusqueda(c.q);
    w.push(or(ilike(systemLogs.message, p), ilike(systemLogs.source, p)));
  }
  if (c.filtros.nivel) w.push(eq(systemLogs.level, c.filtros.nivel));
  if (c.filtros.empresa) w.push(eq(systemLogs.teamId, Number(c.filtros.empresa)));
  // Las fechas son del día dominicano (UTC-4, sin horario de verano): el día
  // empieza a las 04:00 UTC. Así el rango usa el índice y no calcula por fila.
  if (c.filtros.desde) w.push(sql`${systemLogs.createdAt} >= (${c.filtros.desde}::date + interval '4 hours')`);
  if (c.filtros.hasta) w.push(sql`${systemLogs.createdAt} < (${c.filtros.hasta}::date + interval '1 day 4 hours')`);
  const where = and(...w);

  const orden = {
    fecha: sql`${systemLogs.createdAt}`,
    nivel: sql`${systemLogs.level}`,
    origen: sql`${systemLogs.source}`,
    empresa: sql`lower(${teams.name})`,
  }[c.orden.campo] ?? sql`${systemLogs.createdAt}`;

  const { limit, offset } = pagina(c, todo);
  const [filas, [{ total }]] = await Promise.all([
    db.select({
      id: systemLogs.id, nivel: systemLogs.level, origen: systemLogs.source, mensaje: systemLogs.message,
      detalle: sql<string | null>`left(${systemLogs.details}, ${LARGO_DETALLE})`,
      empresaId: systemLogs.teamId, empresa: teams.name, fecha: systemLogs.createdAt,
    }).from(systemLogs).leftJoin(teams, eq(systemLogs.teamId, teams.id)).where(where)
      .orderBy(dir(c.orden.dir, orden as SQL), desc(systemLogs.id)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(systemLogs).where(where),
  ]);
  return {
    total,
    filas: filas.map((f) => ({
      id: f.id, nivel: f.nivel, origen: f.origen, mensaje: f.mensaje, detalle: f.detalle,
      empresaId: f.empresaId, empresa: f.empresa, fecha: iso(f.fecha)!,
    })),
  };
}

export function csvLogs(filas: FilaLog[]) {
  return armarCsv(
    ['ID', 'Fecha', 'Nivel', 'Origen', 'Empresa', 'Mensaje'],
    filas.map((f) => [f.id, fechaDR(f.fecha), f.nivel, f.origen ?? '', f.empresa ?? '', f.mensaje]),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tareas de los colegios (todas)
// ═══════════════════════════════════════════════════════════════════════════

export const DEF_TAREAS: DefTabla = {
  ordenables: ['actividad', 'vence', 'creada', 'colegio', 'estado'],
  porDefecto: { campo: 'actividad', dir: 'desc' },
  filtros: {
    estado: { tipo: 'opciones', opciones: ['pendientes', 'abierta', 'en_proceso', 'en_revision', 'completada', 'todas'] },
    colegio: { tipo: 'entero' },
    asignada: { tipo: 'opciones', opciones: ['soporte', 'persona'] },
    vence: { tipo: 'opciones', opciones: ['vencidas', 'hoy', '7dias', 'sin_fecha'] },
    /** Una sola tarea por su número: la usa la pantalla para la que se abre desde una notificación. */
    tarea: { tipo: 'entero' },
  },
  // Lo primero que se necesita saber es qué falta por hacer.
  filtrosPorDefecto: { estado: 'pendientes' },
};

export interface FilaTarea {
  id: number;
  colegioId: number;
  colegio: string;
  titulo: string;
  /** De quién es: un alumno, una familia o el colegio (sin nombres de menores en esta vista). */
  de: 'alumno' | 'familia' | 'colegio';
  asignadaA: 'soporte' | 'persona';
  asignadaNombre: string | null;
  estado: 'abierta' | 'en_proceso' | 'en_revision' | 'completada';
  vence: string | null;
  creadaPorIa: boolean;
  mensajes: number;
  actividad: string;
  creada: string;
  /** Horas desde el último movimiento, solo en las pendientes. */
  horasSinMover: number | null;
  vencida: boolean;
}

const hoyDR = sql`(now() at time zone ${ZONA})::date`;
const nMensajes = sql<number>`(select count(*)::int from admin_escolar_tarea_mensajes m where m.tarea_id = "admin_escolar_tareas"."id" and m.tipo = 'mensaje')`;

export async function consultarTareas(c: ConsultaTabla, todo = false): Promise<{ filas: FilaTarea[]; total: number }> {
  const t = adminEscolarTareas;
  const w: (SQL | undefined)[] = [];
  if (c.q) w.push(ilike(t.titulo, patronBusqueda(c.q)));

  const est = c.filtros.estado ?? 'pendientes';
  if (est === 'pendientes') w.push(sql`${t.estado} in ('abierta', 'en_proceso', 'en_revision')`);
  else if (est !== 'todas') w.push(eq(t.estado, est));

  if (c.filtros.colegio) w.push(eq(t.teamId, Number(c.filtros.colegio)));
  if (c.filtros.tarea) w.push(eq(t.id, Number(c.filtros.tarea)));
  if (c.filtros.asignada) w.push(eq(t.asignadaA, c.filtros.asignada));
  if (c.filtros.vence === 'vencidas') w.push(sql`${t.venceEl} < ${hoyDR} and ${t.estado} <> 'completada'`);
  if (c.filtros.vence === 'hoy') w.push(sql`${t.venceEl} = ${hoyDR}`);
  if (c.filtros.vence === '7dias') w.push(sql`${t.venceEl} between ${hoyDR} and ${hoyDR} + 7`);
  if (c.filtros.vence === 'sin_fecha') w.push(sql`${t.venceEl} is null`);
  const where = and(...w);

  const orden = {
    actividad: sql`${t.actualizadoEn}`,
    // Sin fecha al final, sea cual sea la dirección.
    vence: sql`${t.venceEl}`,
    creada: sql`${t.creadoEn}`,
    colegio: sql`lower(${teams.name})`,
    estado: sql`${t.estado}`,
  }[c.orden.campo] ?? sql`${t.actualizadoEn}`;

  const { limit, offset } = pagina(c, todo);
  const [filas, [{ total }]] = await Promise.all([
    db.select({
      id: t.id, colegioId: t.teamId, colegio: teams.name, titulo: t.titulo,
      estudianteId: t.estudianteId, clientId: t.clientId,
      asignadaA: t.asignadaA, asignadaNombre: users.name, asignadaCorreo: users.email,
      estado: t.estado, vence: sql<string | null>`${t.venceEl}::text`, creadaPorIa: t.creadaPorIa,
      mensajes: nMensajes, actividad: t.actualizadoEn, creada: t.creadoEn,
      vencida: sql<boolean>`(${t.venceEl} < ${hoyDR} and ${t.estado} <> 'completada')`,
    }).from(t)
      .innerJoin(teams, eq(teams.id, t.teamId))
      .leftJoin(users, eq(users.id, t.asignadaUserId))
      .where(where)
      .orderBy(
        ...(c.orden.campo === 'vence'
          ? [c.orden.dir === 'asc' ? sql`${t.venceEl} asc nulls last` : sql`${t.venceEl} desc nulls last`]
          : [dir(c.orden.dir, orden as SQL)]),
        desc(t.id),
      ).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(t).innerJoin(teams, eq(teams.id, t.teamId)).where(where),
  ]);

  const ahora = Date.now();
  return {
    total,
    filas: filas.map((f): FilaTarea => ({
      id: f.id, colegioId: f.colegioId, colegio: f.colegio, titulo: f.titulo,
      de: f.estudianteId != null ? 'alumno' : f.clientId != null ? 'familia' : 'colegio',
      asignadaA: f.asignadaA === 'soporte' ? 'soporte' : 'persona',
      asignadaNombre: f.asignadaA === 'soporte' ? null : (f.asignadaNombre?.trim() || f.asignadaCorreo || null),
      estado: f.estado as FilaTarea['estado'], vence: f.vence, creadaPorIa: f.creadaPorIa, mensajes: f.mensajes,
      actividad: iso(f.actividad)!, creada: iso(f.creada)!,
      horasSinMover: f.estado === 'completada' ? null : Math.max(0, Math.floor((ahora - new Date(f.actividad).getTime()) / 3_600_000)),
      vencida: !!f.vencida,
    })),
  };
}

/** Los colegios que tienen alguna tarea, para el selector del filtro. */
export async function colegiosConTareas() {
  return db.selectDistinct({ id: teams.id, nombre: teams.name }).from(adminEscolarTareas)
    .innerJoin(teams, eq(teams.id, adminEscolarTareas.teamId)).orderBy(asc(teams.name));
}

export interface ResumenTareas { pendientes: number; deSoporte: number; vencidas: number; sinMover24h: number }

/** Los números de arriba de la pantalla de tareas y del resumen del panel. */
export async function resumenDeTareas(): Promise<ResumenTareas> {
  const t = adminEscolarTareas;
  const [r] = await db.select({
    pendientes: sql<number>`count(*) filter (where ${t.estado} in ('abierta', 'en_proceso', 'en_revision'))::int`,
    deSoporte: sql<number>`count(*) filter (where ${t.estado} in ('abierta', 'en_proceso', 'en_revision') and ${t.asignadaA} = 'soporte')::int`,
    vencidas: sql<number>`count(*) filter (where ${t.estado} <> 'completada' and ${t.venceEl} < ${hoyDR})::int`,
    sinMover24h: sql<number>`count(*) filter (where ${t.estado} in ('abierta', 'en_proceso', 'en_revision') and ${t.actualizadoEn} < now() - interval '24 hours')::int`,
  }).from(t);
  return r ?? { pendientes: 0, deSoporte: 0, vencidas: 0, sinMover24h: 0 };
}

export function csvTareas(filas: FilaTarea[]) {
  const estado = { abierta: 'Abierta', en_proceso: 'En proceso', en_revision: 'En revisión', completada: 'Completada' } as const;
  return armarCsv(
    ['ID', 'Colegio', 'Tarea', 'De', 'Asignada a', 'Estado', 'Vence', 'Mensajes', 'Última actividad', 'Creada'],
    filas.map((f) => [f.id, f.colegio, f.titulo, f.de, f.asignadaA === 'soporte' ? 'Soporte IT · Zero' : (f.asignadaNombre ?? 'Persona'),
      estado[f.estado], f.vence ?? '', f.mensajes, fechaDR(f.actividad), fechaDR(f.creada)]),
  );
}
