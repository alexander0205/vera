/**
 * lib/administracion-escolar/tareas.ts — las tareas por revisar de un alumno y
 * de su familia, con su conversación.
 *
 * Una tarea es de un alumno o de toda su familia. La familia es el responsable
 * de pago (`facturar_a_client_id`): la de un alumno guarda también ese
 * responsable, para que salga al mirar a la familia entera desde cualquiera de
 * los hermanos. Las reglas sin base de datos están en `tareas-reglas.ts`.
 */
import 'server-only';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes, adminEscolarTareaMensajes, adminEscolarTareas, ecfDocuments, teamMembers, users,
} from '@/lib/db/schema';
import { etiquetaAsignada, textoEvento, type NuevaTarea } from './tareas-reglas';

export interface FamiliaDeAlumno {
  estudianteId: number;
  nombre: string;
  clientId: number | null;
  /** Los hermanos activos o no, con el mismo responsable (incluye al alumno). */
  alumnos: { id: number; nombre: string }[];
}

export async function familiaDe(teamId: number, estudianteId: number): Promise<FamiliaDeAlumno | null> {
  const [e] = await db.select({
    id: adminEscolarEstudiantes.id, nombres: adminEscolarEstudiantes.nombres,
    apellidos: adminEscolarEstudiantes.apellidos, clientId: adminEscolarEstudiantes.facturarAClientId,
  })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!e) return null;
  const nombre = `${e.nombres} ${e.apellidos}`.trim();
  if (e.clientId == null) return { estudianteId: e.id, nombre, clientId: null, alumnos: [{ id: e.id, nombre }] };
  const hermanos = await db.select({
    id: adminEscolarEstudiantes.id, nombres: adminEscolarEstudiantes.nombres, apellidos: adminEscolarEstudiantes.apellidos,
  })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.teamId, teamId), eq(adminEscolarEstudiantes.facturarAClientId, e.clientId)))
    .orderBy(asc(adminEscolarEstudiantes.nombres));
  return {
    estudianteId: e.id, nombre, clientId: e.clientId,
    alumnos: hermanos.map((h) => ({ id: h.id, nombre: `${h.nombres} ${h.apellidos}`.trim() })),
  };
}

/** Las tareas del alumno, o las de toda su familia (las suyas, las de sus hermanos y las de la familia). */
function filtroDe(teamId: number, fam: FamiliaDeAlumno, alcance: 'alumno' | 'familia') {
  if (alcance === 'alumno' || fam.clientId == null) {
    return and(eq(adminEscolarTareas.teamId, teamId), eq(adminEscolarTareas.estudianteId, fam.estudianteId));
  }
  return and(
    eq(adminEscolarTareas.teamId, teamId),
    or(
      inArray(adminEscolarTareas.estudianteId, fam.alumnos.map((a) => a.id)),
      and(isNull(adminEscolarTareas.estudianteId), eq(adminEscolarTareas.clientId, fam.clientId)),
    ),
  );
}

/** Cuántas abiertas hay del alumno y de su familia: los números de las dos campanas. */
export async function conteoDeTareas(teamId: number, fam: FamiliaDeAlumno) {
  const contar = async (alcance: 'alumno' | 'familia') => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` })
      .from(adminEscolarTareas)
      .where(and(filtroDe(teamId, fam, alcance), eq(adminEscolarTareas.estado, 'abierta')));
    return r?.n ?? 0;
  };
  const [alumno, familia] = await Promise.all([contar('alumno'), contar('familia')]);
  return { alumno, familia };
}

export interface TareaEnLista {
  id: number;
  titulo: string;
  estado: 'abierta' | 'completada';
  /** De quién es: el nombre del alumno, o «Toda la familia». */
  de: string;
  asignada: string;
  documento: string | null;
  creadaPorIa: boolean;
  venceEl: string | null;
  ultimo: { autor: string; texto: string; tipo: string; creadoEn: string } | null;
  mensajes: number;
  actualizadoEn: string;
}

export async function listarTareas(
  teamId: number, fam: FamiliaDeAlumno, alcance: 'alumno' | 'familia', estado: 'abierta' | 'completada',
): Promise<TareaEnLista[]> {
  const persona = sql<string | null>`(SELECT coalesce(nullif(trim(u.name), ''), u.email) FROM users u WHERE u.id = ${adminEscolarTareas.asignadaUserId})`;
  const filas = await db.select({
    id: adminEscolarTareas.id,
    titulo: adminEscolarTareas.titulo,
    estado: adminEscolarTareas.estado,
    estudianteId: adminEscolarTareas.estudianteId,
    asignadaA: adminEscolarTareas.asignadaA,
    persona,
    documento: ecfDocuments.codigo,
    creadaPorIa: adminEscolarTareas.creadaPorIa,
    venceEl: adminEscolarTareas.venceEl,
    actualizadoEn: adminEscolarTareas.actualizadoEn,
  })
    .from(adminEscolarTareas)
    .leftJoin(ecfDocuments, eq(ecfDocuments.id, adminEscolarTareas.ecfDocumentId))
    .where(and(filtroDe(teamId, fam, alcance), eq(adminEscolarTareas.estado, estado)))
    .orderBy(desc(adminEscolarTareas.actualizadoEn))
    .limit(200);
  if (filas.length === 0) return [];

  const ids = filas.map((f) => f.id);
  const mensajes = await db.select({
    tareaId: adminEscolarTareaMensajes.tareaId, autor: adminEscolarTareaMensajes.autor,
    texto: adminEscolarTareaMensajes.texto, tipo: adminEscolarTareaMensajes.tipo, creadoEn: adminEscolarTareaMensajes.creadoEn,
  })
    .from(adminEscolarTareaMensajes)
    .where(inArray(adminEscolarTareaMensajes.tareaId, ids))
    .orderBy(asc(adminEscolarTareaMensajes.creadoEn), asc(adminEscolarTareaMensajes.id));
  const porTarea = new Map<number, typeof mensajes>();
  for (const m of mensajes) porTarea.set(m.tareaId, [...(porTarea.get(m.tareaId) ?? []), m]);
  const nombres = new Map(fam.alumnos.map((a) => [a.id, a.nombre]));

  return filas.map((f) => {
    const suyos = porTarea.get(f.id) ?? [];
    // Lo último que alguien dijo; si nadie ha escrito, el último evento.
    const ultimo = [...suyos].reverse().find((m) => m.tipo !== 'evento') ?? suyos[suyos.length - 1] ?? null;
    return {
      id: f.id,
      titulo: f.titulo,
      estado: f.estado as TareaEnLista['estado'],
      de: f.estudianteId == null ? 'Toda la familia' : (nombres.get(f.estudianteId) ?? 'Alumno'),
      asignada: etiquetaAsignada(f.asignadaA, f.persona),
      documento: f.documento ?? null,
      creadaPorIa: f.creadaPorIa,
      venceEl: f.venceEl ? String(f.venceEl) : null,
      ultimo: ultimo ? { autor: ultimo.autor, texto: ultimo.texto, tipo: ultimo.tipo, creadoEn: ultimo.creadoEn.toISOString() } : null,
      mensajes: suyos.filter((m) => m.tipo !== 'evento').length,
      actualizadoEn: f.actualizadoEn.toISOString(),
    };
  });
}

export async function crearTarea(
  teamId: number, fam: FamiliaDeAlumno, autor: { userId: number; nombre: string }, t: NuevaTarea,
  personaNombre: string | null,
) {
  return db.transaction(async (tx) => {
    const [fila] = await tx.insert(adminEscolarTareas).values({
      teamId,
      estudianteId: t.alcance === 'familia' && fam.clientId != null ? null : fam.estudianteId,
      clientId: fam.clientId,
      titulo: t.titulo,
      descripcion: t.descripcion,
      asignadaA: t.asignadaA,
      asignadaUserId: t.asignadaUserId,
      ecfDocumentId: t.ecfDocumentId,
      venceEl: t.venceEl,
      creadaPorUserId: autor.userId,
    }).returning({ id: adminEscolarTareas.id });
    const linea = [
      { teamId, tareaId: fila.id, tipo: 'evento', userId: autor.userId, autor: autor.nombre,
        texto: textoEvento.creada(autor.nombre, etiquetaAsignada(t.asignadaA, personaNombre)) },
    ];
    if (t.descripcion) linea.push({ teamId, tareaId: fila.id, tipo: 'mensaje', userId: autor.userId, autor: autor.nombre, texto: t.descripcion });
    await tx.insert(adminEscolarTareaMensajes).values(linea);
    return fila.id;
  });
}

/** Una tarea del colegio con su conversación, o null si no es de este colegio. */
export async function leerTarea(teamId: number, id: number) {
  const persona = sql<string | null>`(SELECT coalesce(nullif(trim(u.name), ''), u.email) FROM users u WHERE u.id = ${adminEscolarTareas.asignadaUserId})`;
  const alumno = sql<string | null>`(SELECT trim(e.nombres || ' ' || e.apellidos) FROM admin_escolar_estudiantes e WHERE e.id = ${adminEscolarTareas.estudianteId})`;
  const [t] = await db.select({
    id: adminEscolarTareas.id, titulo: adminEscolarTareas.titulo, descripcion: adminEscolarTareas.descripcion,
    estado: adminEscolarTareas.estado, estudianteId: adminEscolarTareas.estudianteId, alumno,
    asignadaA: adminEscolarTareas.asignadaA, persona, documento: ecfDocuments.codigo,
    ecfDocumentId: adminEscolarTareas.ecfDocumentId, creadaPorIa: adminEscolarTareas.creadaPorIa,
    venceEl: adminEscolarTareas.venceEl,
  })
    .from(adminEscolarTareas)
    .leftJoin(ecfDocuments, eq(ecfDocuments.id, adminEscolarTareas.ecfDocumentId))
    .where(and(eq(adminEscolarTareas.id, id), eq(adminEscolarTareas.teamId, teamId)))
    .limit(1);
  if (!t) return null;
  const mensajes = await db.select({
    id: adminEscolarTareaMensajes.id, tipo: adminEscolarTareaMensajes.tipo, userId: adminEscolarTareaMensajes.userId,
    autor: adminEscolarTareaMensajes.autor, texto: adminEscolarTareaMensajes.texto, creadoEn: adminEscolarTareaMensajes.creadoEn,
  })
    .from(adminEscolarTareaMensajes)
    .where(eq(adminEscolarTareaMensajes.tareaId, id))
    .orderBy(asc(adminEscolarTareaMensajes.creadoEn), asc(adminEscolarTareaMensajes.id));
  return {
    id: t.id, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado,
    de: t.estudianteId == null ? 'Toda la familia' : (t.alumno ?? 'Alumno'),
    asignada: etiquetaAsignada(t.asignadaA, t.persona),
    documento: t.documento ?? null, ecfDocumentId: t.ecfDocumentId,
    creadaPorIa: t.creadaPorIa, venceEl: t.venceEl ? String(t.venceEl) : null,
    mensajes: mensajes.map((m) => ({ ...m, creadoEn: m.creadoEn.toISOString() })),
  };
}

export async function agregarMensaje(teamId: number, id: number, autor: { userId: number; nombre: string }, texto: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select({ id: adminEscolarTareas.id }).from(adminEscolarTareas)
      .where(and(eq(adminEscolarTareas.id, id), eq(adminEscolarTareas.teamId, teamId))).limit(1);
    if (!t) return false;
    await tx.insert(adminEscolarTareaMensajes).values({ teamId, tareaId: id, tipo: 'mensaje', userId: autor.userId, autor: autor.nombre, texto });
    await tx.update(adminEscolarTareas).set({ actualizadoEn: new Date() }).where(eq(adminEscolarTareas.id, id));
    return true;
  });
}

/** Completar o volver a abrir. Deja su línea en la conversación. `null` si no existe o ya estaba así. */
export async function cambiarEstadoTarea(
  teamId: number, id: number, autor: { userId: number; nombre: string }, accion: 'completar' | 'reabrir',
) {
  return db.transaction(async (tx) => {
    const completar = accion === 'completar';
    const [fila] = await tx.update(adminEscolarTareas)
      .set(completar
        ? { estado: 'completada', completadaPorUserId: autor.userId, completadaEn: new Date(), actualizadoEn: new Date() }
        : { estado: 'abierta', completadaPorUserId: null, completadaEn: null, actualizadoEn: new Date() })
      .where(and(
        eq(adminEscolarTareas.id, id), eq(adminEscolarTareas.teamId, teamId),
        eq(adminEscolarTareas.estado, completar ? 'abierta' : 'completada'),
      ))
      .returning({ id: adminEscolarTareas.id });
    if (!fila) return null;
    await tx.insert(adminEscolarTareaMensajes).values({
      teamId, tareaId: id, tipo: 'evento', userId: autor.userId, autor: autor.nombre,
      texto: completar ? textoEvento.completada(autor.nombre) : textoEvento.reabierta(autor.nombre),
    });
    return fila.id;
  });
}

/** Las personas del colegio, para asignarle una tarea a alguien en concreto. */
export async function personasDelColegio(teamId: number) {
  const filas = await db.select({ id: users.id, name: users.name, email: users.email, platformRole: users.platformRole })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
  return filas
    // El equipo de Zero no es del colegio: para eso está «Soporte IT».
    .filter((u) => u.platformRole !== 'admin')
    .map((u) => ({ id: u.id, nombre: u.name?.trim() || u.email }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
