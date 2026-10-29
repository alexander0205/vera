/**
 * lib/administracion-escolar/tareas.ts — las tareas por revisar de un alumno,
 * de su familia o del colegio, con su conversación.
 *
 * Una tarea es de un alumno, de toda su familia o del colegio (sin alumno ni
 * familia: se crean desde «Por revisar»). La familia es el responsable de pago
 * (`facturar_a_client_id`): la de un alumno guarda también ese responsable,
 * para que salga al mirar a la familia entera desde cualquiera de los
 * hermanos. Las reglas sin base de datos están en `tareas-reglas.ts`.
 */
import 'server-only';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes, adminEscolarTareaAdjuntos, adminEscolarTareaMensajes, adminEscolarTareas, clients, ecfDocuments,
  teamMembers, teams, users,
} from '@/lib/db/schema';
import { SOPORTE } from '@/lib/config/soporte';
import { armarCorreoResumenIa, armarCorreoTarea, enviarAvisoTarea, type CorreoTarea } from '@/lib/email/escolar-tareas';
import { avisarTareaEnSlack } from './tareas-slack';
import { notificarTarea } from '@/lib/notificaciones/tareas';
import {
  aQuienAvisar, DE_COLEGIO, DESTINO, etiquetaAsignada, PENDIENTES, textoEvento,
  type AccionEstado, type AutorTarea, type AvisoTarea, type EstadoTarea, type NuevoAdjunto, type NuevaTarea,
} from './tareas-reglas';

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

/** Cuántas pendientes (abiertas o en revisión) hay del alumno y de su familia: los números de las dos campanas. */
export async function conteoDeTareas(teamId: number, fam: FamiliaDeAlumno) {
  const contar = async (alcance: 'alumno' | 'familia') => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` })
      .from(adminEscolarTareas)
      .where(and(filtroDe(teamId, fam, alcance), inArray(adminEscolarTareas.estado, PENDIENTES)));
    return r?.n ?? 0;
  };
  const [alumno, familia] = await Promise.all([contar('alumno'), contar('familia')]);
  return { alumno, familia };
}

export interface TareaEnLista {
  id: number;
  titulo: string;
  estado: EstadoTarea;
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

/** `abierta` trae las pendientes: abiertas y en revisión. */
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
    .where(and(filtroDe(teamId, fam, alcance), estado === 'abierta'
      ? inArray(adminEscolarTareas.estado, PENDIENTES) : eq(adminEscolarTareas.estado, 'completada')))
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

/** `fam` es null en una tarea del colegio: no lleva alumno ni familia. */
export async function crearTarea(
  teamId: number, fam: FamiliaDeAlumno | null, autor: AutorTarea, t: NuevaTarea,
  personaNombre: string | null, ia?: { origenClave: string; cargoId: number | null },
) {
  return db.transaction(async (tx) => {
    const [fila] = await tx.insert(adminEscolarTareas).values({
      teamId,
      estudianteId: !fam || (t.alcance === 'familia' && fam.clientId != null) ? null : fam.estudianteId,
      clientId: fam?.clientId ?? null,
      titulo: t.titulo,
      descripcion: t.descripcion,
      asignadaA: t.asignadaA,
      asignadaUserId: t.asignadaUserId,
      ecfDocumentId: t.ecfDocumentId,
      venceEl: t.venceEl,
      creadaPorUserId: autor.userId,
      creadaPorIa: ia != null,
      origenClave: ia?.origenClave ?? null,
      cargoId: ia?.cargoId ?? null,
    }).onConflictDoNothing().returning({ id: adminEscolarTareas.id });
    // Zero AI ya había abierto esta misma tarea: no se repite.
    if (!fila) return null;
    const linea = [
      { teamId, tareaId: fila.id, tipo: 'evento', userId: autor.userId, autor: autor.nombre,
        texto: textoEvento.creada(autor.nombre, etiquetaAsignada(t.asignadaA, personaNombre)) },
    ];
    if (t.descripcion) {
      linea.push({ teamId, tareaId: fila.id, tipo: ia ? 'ia' : 'mensaje', userId: autor.userId, autor: autor.nombre, texto: t.descripcion });
    }
    await tx.insert(adminEscolarTareaMensajes).values(linea);
    return fila.id;
  });
}

/** De quién es, como se lee en la lista y en el correo. */
const deQuien = (estudianteId: number | null, clientId: number | null, alumno: string | null) =>
  estudianteId != null ? (alumno ?? 'Alumno') : clientId != null ? 'Toda la familia' : DE_COLEGIO;

/** Una tarea del colegio con su conversación, o null si no es de este colegio. */
export async function leerTarea(teamId: number, id: number) {
  const persona = sql<string | null>`(SELECT coalesce(nullif(trim(u.name), ''), u.email) FROM users u WHERE u.id = ${adminEscolarTareas.asignadaUserId})`;
  const alumno = sql<string | null>`(SELECT trim(e.nombres || ' ' || e.apellidos) FROM admin_escolar_estudiantes e WHERE e.id = ${adminEscolarTareas.estudianteId})`;
  // La ficha a la que lleva: la del alumno o, si es de la familia, la de uno de sus hijos.
  const fichaId = sql<number | null>`coalesce(${adminEscolarTareas.estudianteId}, (
    SELECT e.id FROM admin_escolar_estudiantes e
    WHERE e.team_id = ${adminEscolarTareas.teamId} AND e.facturar_a_client_id = ${adminEscolarTareas.clientId}
    ORDER BY (e.estado = 'activo') DESC, e.id LIMIT 1))`;
  const [t] = await db.select({
    id: adminEscolarTareas.id, titulo: adminEscolarTareas.titulo, descripcion: adminEscolarTareas.descripcion,
    estado: adminEscolarTareas.estado, estudianteId: adminEscolarTareas.estudianteId, clientId: adminEscolarTareas.clientId, alumno, fichaId,
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
    adjuntoId: adminEscolarTareaAdjuntos.id, adjuntoMime: adminEscolarTareaAdjuntos.mime, adjuntoBytes: adminEscolarTareaAdjuntos.bytes,
  })
    .from(adminEscolarTareaMensajes)
    .leftJoin(adminEscolarTareaAdjuntos, and(
      eq(adminEscolarTareaAdjuntos.id, adminEscolarTareaMensajes.adjuntoId), eq(adminEscolarTareaAdjuntos.subido, true)))
    .where(eq(adminEscolarTareaMensajes.tareaId, id))
    .orderBy(asc(adminEscolarTareaMensajes.creadoEn), asc(adminEscolarTareaMensajes.id));
  return {
    id: t.id, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado,
    de: deQuien(t.estudianteId, t.clientId, t.alumno),
    fichaId: t.fichaId,
    asignada: etiquetaAsignada(t.asignadaA, t.persona),
    documento: t.documento ?? null, ecfDocumentId: t.ecfDocumentId,
    creadaPorIa: t.creadaPorIa, venceEl: t.venceEl ? String(t.venceEl) : null,
    mensajes: mensajes.map(({ adjuntoId, adjuntoMime, adjuntoBytes, ...m }) => ({
      ...m,
      creadoEn: m.creadoEn.toISOString(),
      adjunto: adjuntoId != null ? { id: adjuntoId, mime: adjuntoMime ?? '', bytes: adjuntoBytes ?? 0 } : null,
    })),
  };
}

export async function agregarMensaje(teamId: number, id: number, autor: AutorTarea, texto: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select({ id: adminEscolarTareas.id }).from(adminEscolarTareas)
      .where(and(eq(adminEscolarTareas.id, id), eq(adminEscolarTareas.teamId, teamId))).limit(1);
    if (!t) return false;
    await tx.insert(adminEscolarTareaMensajes).values({ teamId, tareaId: id, tipo: 'mensaje', userId: autor.userId, autor: autor.nombre, texto });
    await tx.update(adminEscolarTareas).set({ actualizadoEn: new Date() }).where(eq(adminEscolarTareas.id, id));
    return true;
  });
}

/**
 * Completar, pasar a revisión o volver a abrir (ver `DESTINO`). Deja su línea
 * en la conversación. `null` si no existe o ya estaba así.
 */
export async function cambiarEstadoTarea(teamId: number, id: number, autor: AutorTarea, accion: AccionEstado) {
  const { a, desde } = DESTINO[accion];
  return db.transaction(async (tx) => {
    const [fila] = await tx.update(adminEscolarTareas)
      .set(a === 'completada'
        ? { estado: a, completadaPorUserId: autor.userId, completadaEn: new Date(), actualizadoEn: new Date() }
        : { estado: a, completadaPorUserId: null, completadaEn: null, actualizadoEn: new Date() })
      .where(and(
        eq(adminEscolarTareas.id, id), eq(adminEscolarTareas.teamId, teamId), inArray(adminEscolarTareas.estado, desde),
      ))
      .returning({ id: adminEscolarTareas.id });
    if (!fila) return null;
    const texto = a === 'completada' ? textoEvento.completada(autor.nombre)
      : a === 'en_revision' ? textoEvento.revision(autor.nombre) : textoEvento.reabierta(autor.nombre);
    await tx.insert(adminEscolarTareaMensajes).values({
      teamId, tareaId: id, tipo: 'evento', userId: autor.userId, autor: autor.nombre, texto,
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

/**
 * Los correos salen solo desde producción. Una copia de la base trae los
 * correos reales del personal del colegio: una prueba en local o en un preview
 * no puede escribirles. Fuera de producción el aviso queda en el log.
 */
const correosDeVerdad = () => process.env.VERCEL_ENV === 'production';

/**
 * Avisa del cambio: por correo y en la campana de arriba (con push al
 * celular) a quien le toca (ver `aQuienAvisar`) y, todo, al canal de Slack del
 * equipo de Zero. Nunca lanza: la tarea ya quedó
 * guardada, y un aviso que no sale no la deshace. Se llama con `after()` desde
 * la ruta, para no hacer esperar a quien escribe.
 */
export async function avisarDeTarea(
  teamId: number, tareaId: number, aviso: AvisoTarea, autor: AutorTarea, texto: string | null,
  /** `duenos`: también a los dueños del colegio (las plantillas de Soporte: ver la ruta `plantilla`). */
  opts: { duenos?: boolean } = {},
): Promise<void> {
  try {
    const t = await leerTarea(teamId, tareaId);
    if (!t) return;
    const [fila] = await db.select({
      asignadaA: adminEscolarTareas.asignadaA, asignadaUserId: adminEscolarTareas.asignadaUserId,
      creadaPorUserId: adminEscolarTareas.creadaPorUserId, colegio: teams.name,
    })
      .from(adminEscolarTareas)
      .innerJoin(teams, eq(teams.id, adminEscolarTareas.teamId))
      .where(eq(adminEscolarTareas.id, tareaId))
      .limit(1);
    if (!fila) return;

    if (correosDeVerdad()) {
      await avisarTareaEnSlack({
        aviso, colegio: fila.colegio, tareaId, titulo: t.titulo, de: t.de, asignada: t.asignada,
        estado: t.estado as EstadoTarea, autor: autor.nombre, texto, documento: t.documento,
      });
    } else {
      console.info('[tareas] slack sin enviar (fuera de producción)', { tareaId, aviso });
    }

    const participantes = [...new Set(t.mensajes
      .filter((m) => m.tipo === 'mensaje' && m.userId != null).map((m) => m.userId as number))];
    const avisar = aQuienAvisar(fila, participantes, aviso, autor);
    const { soporte } = avisar;
    let usuarios = avisar.usuarios;
    if (opts.duenos) {
      const duenos = await db.select({ id: users.id, platformRole: users.platformRole })
        .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner'), isNull(users.deletedAt)));
      usuarios = [...new Set([...usuarios, ...duenos
        .filter((d) => d.platformRole !== 'admin' && d.id !== autor.userId).map((d) => d.id)])];
    }

    // La campana y el celular de las mismas personas que reciben el correo.
    await notificarTarea(teamId, usuarios, {
      cambio: aviso, tareaId, titulo: t.titulo, autor: autor.nombre, texto,
    }, fila.colegio);

    const correos = new Set<string>();
    if (soporte) correos.add(SOPORTE.correo);
    if (usuarios.length > 0) {
      const filas = await db.select({ email: users.email }).from(users)
        .where(and(inArray(users.id, usuarios), isNull(users.deletedAt)));
      for (const f of filas) if (f.email) correos.add(f.email.trim().toLowerCase());
    }
    if (correos.size === 0) return;

    const correo = armarCorreoTarea({
      aviso, colegio: fila.colegio, tareaId, titulo: t.titulo, de: t.de, asignada: t.asignada,
      autor: autor.nombre, texto, documento: t.documento,
    });
    await mandar([...correos], correo, `${tareaId}:${aviso}`);
  } catch (err) {
    console.error('[tareas] no se pudo avisar', tareaId, aviso, err instanceof Error ? err.message : err);
  }
}

// ── Todas las del colegio: la pantalla «Por revisar» y la campana ────────────

/** Quien mira la lista: su usuario, y si es del equipo de Zero (le toca Soporte IT). */
export interface QuienMira { userId: number; esSoporte: boolean }

export const quienMira = (user: { id: number; platformRole?: string | null }): QuienMira =>
  ({ userId: user.id, esSoporte: user.platformRole === 'admin' });

/** Las que le tocan: las suyas con nombre y, al equipo de Zero, las de Soporte IT. */
const sonMias = (yo: QuienMira) => or(
  and(eq(adminEscolarTareas.asignadaA, 'persona'), eq(adminEscolarTareas.asignadaUserId, yo.userId)),
  yo.esSoporte ? eq(adminEscolarTareas.asignadaA, 'soporte') : sql`false`,
)!;

/** El número de la campana: las pendientes (abiertas o en revisión) que le tocan a quien mira. */
export async function conteoMias(teamId: number, yo: QuienMira): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` })
    .from(adminEscolarTareas)
    .where(and(eq(adminEscolarTareas.teamId, teamId), inArray(adminEscolarTareas.estado, PENDIENTES), sonMias(yo)));
  return r?.n ?? 0;
}

export interface FiltroColegio {
  /** `mias` y `todas` son las pendientes (abiertas y en revisión). */
  vista: 'mias' | 'todas' | 'revision' | 'hechas';
  origen: 'todas' | 'ia' | 'personas';
  /** `soporte`, `persona` o vacío para cualquiera. */
  asignada: string;
}

export interface TareaDelColegio {
  id: number;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  de: string;
  asignadaA: string;
  asignada: string;
  documento: string | null;
  creadaPorIa: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface FamiliaConTareas {
  clave: string;
  /** El responsable de pago, o el alumno si no tiene. */
  nombre: string;
  alumnos: string;
  /** A qué ficha lleva «Ir a la ficha». */
  estudianteId: number | null;
  abiertas: number;
  tareas: TareaDelColegio[];
}

/** El grupo de las tareas sin alumno ni familia. */
export const CLAVE_COLEGIO = 'colegio';

const nombreCorto = (nombres: string) => {
  const p = nombres.trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};
const enLista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

export async function tareasDelColegio(teamId: number, yo: QuienMira, f: FiltroColegio) {
  const t = adminEscolarTareas;
  const mias = sonMias(yo);
  // «Abiertas» en los números son las pendientes: abiertas y en revisión.
  const pendiente = sql`${t.estado} in ('abierta', 'en_revision')`;
  const [c] = await db.select({
    abiertas: sql<number>`count(*) filter (where ${pendiente})::int`,
    mias: sql<number>`count(*) filter (where ${pendiente} and ${mias})::int`,
    revision: sql<number>`count(*) filter (where ${t.estado} = 'en_revision')::int`,
    hechas: sql<number>`count(*) filter (where ${t.estado} = 'completada')::int`,
    ia: sql<number>`count(*) filter (where ${pendiente} and ${t.creadaPorIa})::int`,
    viejas: sql<number>`count(*) filter (where ${pendiente} and ${t.creadoEn} < now() - interval '7 days')::int`,
    familias: sql<number>`count(distinct coalesce(${t.clientId}::text, 'e' || ${t.estudianteId}::text)) filter (where ${pendiente})::int`,
    colegio: sql<number>`count(*) filter (where ${pendiente} and ${t.clientId} is null and ${t.estudianteId} is null)::int`,
  }).from(t).where(eq(t.teamId, teamId));

  const condiciones = [eq(t.teamId, teamId)];
  if (f.vista === 'hechas') condiciones.push(eq(t.estado, 'completada'));
  else if (f.vista === 'revision') condiciones.push(eq(t.estado, 'en_revision'));
  else condiciones.push(inArray(t.estado, PENDIENTES));
  if (f.vista === 'mias') condiciones.push(mias);
  if (f.origen === 'ia') condiciones.push(eq(t.creadaPorIa, true));
  if (f.origen === 'personas') condiciones.push(eq(t.creadaPorIa, false));
  if (f.asignada) condiciones.push(eq(t.asignadaA, f.asignada));

  const persona = sql<string | null>`(SELECT coalesce(nullif(trim(u.name), ''), u.email) FROM users u WHERE u.id = ${t.asignadaUserId})`;
  const filas = await db.select({
    id: t.id, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado,
    estudianteId: t.estudianteId, clientId: t.clientId,
    nombres: adminEscolarEstudiantes.nombres, apellidos: adminEscolarEstudiantes.apellidos,
    responsable: clients.razonSocial,
    asignadaA: t.asignadaA, persona, documento: ecfDocuments.codigo, creadaPorIa: t.creadaPorIa,
    creadoEn: t.creadoEn, actualizadoEn: t.actualizadoEn,
  })
    .from(t)
    .leftJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, t.estudianteId))
    .leftJoin(clients, eq(clients.id, t.clientId))
    .leftJoin(ecfDocuments, eq(ecfDocuments.id, t.ecfDocumentId))
    .where(and(...condiciones))
    .orderBy(desc(t.actualizadoEn))
    .limit(300);

  // Los hermanos de cada familia, para decir de quién se habla y llevar a una ficha.
  const clientIds = [...new Set(filas.map((x) => x.clientId).filter((x): x is number => x != null))];
  const hermanos = clientIds.length === 0 ? [] : await db.select({
    id: adminEscolarEstudiantes.id, nombres: adminEscolarEstudiantes.nombres,
    clientId: adminEscolarEstudiantes.facturarAClientId, estado: adminEscolarEstudiantes.estado,
  })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.teamId, teamId), inArray(adminEscolarEstudiantes.facturarAClientId, clientIds)))
    .orderBy(asc(adminEscolarEstudiantes.nombres));
  const porFamilia = new Map<number, { id: number; nombre: string }[]>();
  for (const h of hermanos) {
    if (h.clientId == null || h.estado !== 'activo') continue;
    porFamilia.set(h.clientId, [...(porFamilia.get(h.clientId) ?? []), { id: h.id, nombre: nombreCorto(h.nombres) }]);
  }

  // Abiertas por familia, aunque la vista enseñe otra cosa: es el número del grupo.
  const abiertasPor = new Map<string, number>();
  const claves = clientIds.length === 0 ? [] : await db.select({ clientId: t.clientId, n: sql<number>`count(*)::int` })
    .from(t)
    .where(and(eq(t.teamId, teamId), inArray(t.estado, PENDIENTES), inArray(t.clientId, clientIds)))
    .groupBy(t.clientId);
  for (const k of claves) abiertasPor.set(`c${k.clientId}`, k.n);

  const familias = new Map<string, FamiliaConTareas>();
  for (const x of filas) {
    // Las que no son de ningún alumno ni familia van juntas en «Del colegio».
    const clave = x.clientId != null ? `c${x.clientId}` : x.estudianteId != null ? `e${x.estudianteId}` : CLAVE_COLEGIO;
    const alumno = x.nombres ? nombreCorto(x.nombres) : null;
    let fam = familias.get(clave);
    if (!fam) {
      const hs = x.clientId != null ? (porFamilia.get(x.clientId) ?? []) : [];
      fam = {
        clave,
        nombre: clave === CLAVE_COLEGIO ? DE_COLEGIO
          : x.responsable ?? (x.nombres ? `${x.nombres} ${x.apellidos ?? ''}`.trim() : 'Sin responsable'),
        alumnos: enLista(hs.length ? hs.map((h) => h.nombre) : (alumno ? [alumno] : [])),
        estudianteId: x.estudianteId ?? hs[0]?.id ?? null,
        abiertas: clave === CLAVE_COLEGIO ? (c?.colegio ?? 0) : (abiertasPor.get(clave) ?? 0),
        tareas: [],
      };
      familias.set(clave, fam);
    }
    if (x.clientId == null && clave !== CLAVE_COLEGIO && PENDIENTES.includes(x.estado as EstadoTarea)) fam.abiertas += 1;
    fam.tareas.push({
      id: x.id, titulo: x.titulo, descripcion: x.descripcion, estado: x.estado as EstadoTarea,
      de: deQuien(x.estudianteId, x.clientId, alumno),
      asignadaA: x.asignadaA, asignada: etiquetaAsignada(x.asignadaA, x.persona),
      documento: x.documento ?? null, creadaPorIa: x.creadaPorIa,
      creadoEn: x.creadoEn.toISOString(), actualizadoEn: x.actualizadoEn.toISOString(),
    });
  }

  // Las del colegio arriba: no tienen ficha a la que ir, y abajo se pierden entre las familias.
  const grupos = [...familias.values()].sort((a, b) => Number(b.clave === CLAVE_COLEGIO) - Number(a.clave === CLAVE_COLEGIO));
  return {
    cuentas: { mias: c?.mias ?? 0, todas: c?.abiertas ?? 0, revision: c?.revision ?? 0, hechas: c?.hechas ?? 0 },
    kpis: { abiertas: c?.abiertas ?? 0, familias: c?.familias ?? 0, colegio: c?.colegio ?? 0, mias: c?.mias ?? 0, ia: c?.ia ?? 0, viejas: c?.viejas ?? 0 },
    familias: grupos,
  };
}

// ── Archivos adjuntos ────────────────────────────────────────────────────────

/** Abre la subida de un archivo. `null` si la tarea no es de este colegio. */
export async function crearAdjunto(teamId: number, tareaId: number, userId: number, a: NuevoAdjunto, s3Key: string) {
  const [t] = await db.select({ id: adminEscolarTareas.id }).from(adminEscolarTareas)
    .where(and(eq(adminEscolarTareas.id, tareaId), eq(adminEscolarTareas.teamId, teamId))).limit(1);
  if (!t) return null;
  const [fila] = await db.insert(adminEscolarTareaAdjuntos).values({
    teamId, tareaId, userId, nombre: a.nombre, mime: a.mime, bytes: a.bytes, s3Key,
  }).returning({ id: adminEscolarTareaAdjuntos.id });
  return fila.id;
}

export async function leerAdjunto(teamId: number, tareaId: number, adjuntoId: number) {
  const [a] = await db.select().from(adminEscolarTareaAdjuntos)
    .where(and(
      eq(adminEscolarTareaAdjuntos.id, adjuntoId), eq(adminEscolarTareaAdjuntos.teamId, teamId),
      eq(adminEscolarTareaAdjuntos.tareaId, tareaId),
    ))
    .limit(1);
  return a ?? null;
}

/**
 * Guarda cómo va la subida después de un trozo. Solo si nadie la movió
 * mientras tanto: `trozosAntes` es el turno que se procesó.
 */
export async function guardarSubida(
  adjuntoId: number, trozosAntes: number,
  e: { uploadId: string | null; partes: { PartNumber: number; ETag: string }[]; pendiente: boolean },
): Promise<boolean> {
  const r = await db.update(adminEscolarTareaAdjuntos)
    .set({ uploadId: e.uploadId, partes: e.partes, pendiente: e.pendiente, trozos: trozosAntes + 1 })
    .where(and(
      eq(adminEscolarTareaAdjuntos.id, adjuntoId), eq(adminEscolarTareaAdjuntos.trozos, trozosAntes),
      eq(adminEscolarTareaAdjuntos.subido, false),
    ))
    .returning({ id: adminEscolarTareaAdjuntos.id });
  return r.length > 0;
}

/** El archivo quedó entero en S3: sale en la conversación con su nombre. */
export async function cerrarAdjunto(teamId: number, tareaId: number, adjuntoId: number, autor: AutorTarea, nombre: string) {
  return db.transaction(async (tx) => {
    const [a] = await tx.update(adminEscolarTareaAdjuntos)
      .set({ subido: true, pendiente: false })
      .where(and(eq(adminEscolarTareaAdjuntos.id, adjuntoId), eq(adminEscolarTareaAdjuntos.subido, false)))
      .returning({ id: adminEscolarTareaAdjuntos.id });
    if (!a) return false;
    await tx.insert(adminEscolarTareaMensajes).values({
      teamId, tareaId, tipo: 'adjunto', userId: autor.userId, autor: autor.nombre, texto: nombre, adjuntoId,
    });
    await tx.update(adminEscolarTareas).set({ actualizadoEn: new Date() }).where(eq(adminEscolarTareas.id, tareaId));
    return true;
  });
}

// ── La factura relacionada ───────────────────────────────────────────────────

/** Las facturas y notas de la familia (o del alumno sin responsable), para elegir la relacionada. */
export async function documentosDeLaFamilia(teamId: number, fam: FamiliaDeAlumno) {
  if (fam.clientId == null) return [];
  const filas = await db.select({
    id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf,
    tipoEcf: ecfDocuments.tipoEcf, fecha: ecfDocuments.fechaEmision,
    montoTotal: ecfDocuments.montoTotal, estado: ecfDocuments.estado,
  })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.clientId, fam.clientId)))
    .orderBy(desc(ecfDocuments.fechaEmision), desc(ecfDocuments.id))
    .limit(60);
  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo ?? f.encf,
    tipoEcf: f.tipoEcf,
    fecha: f.fecha ? new Date(f.fecha).toISOString().slice(0, 10) : null,
    montoTotal: f.montoTotal,
    anulado: f.estado === 'ANULADO',
  }));
}

/** Que la factura que se quiere relacionar sea de este colegio. */
export async function documentoDelColegio(teamId: number, id: number): Promise<boolean> {
  const [f] = await db.select({ id: ecfDocuments.id }).from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId))).limit(1);
  return !!f;
}

/** Manda el correo a cada uno, o lo deja en el log fuera de producción. Nunca lanza. */
async function mandar(correos: string[], correo: CorreoTarea, contexto: string) {
  if (correos.length === 0) return;
  if (!correosDeVerdad()) {
    console.info('[tareas] correo sin enviar (fuera de producción)', { contexto, a: correos.length, asunto: correo.asunto });
    return;
  }
  for (const email of correos) {
    await enviarAvisoTarea(email, correo).catch((err: unknown) => {
      console.error('[tareas] no salió el correo', contexto, err instanceof Error ? err.message : err);
    });
  }
}

/**
 * Un solo correo con lo que Zero AI abrió en una revisión, a quien se le
 * asignó (o a Soporte IT si el colegio no tiene Propietario). Nunca lanza.
 */
export async function avisarResumenIa(teamId: number, userId: number | null, tareas: { id: number; titulo: string }[]) {
  try {
    const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
    let destino: string | null = SOPORTE.correo;
    if (userId) {
      const [u] = await db.select({ email: users.email }).from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
      destino = u?.email?.trim().toLowerCase() || null;
    }
    if (!destino) return;
    await mandar([destino], armarCorreoResumenIa({ colegio: team?.nombre ?? 'el colegio', tareas }), `ia:${teamId}`);
  } catch (err) {
    console.error('[tareas] no se pudo avisar lo de Zero AI', teamId, err instanceof Error ? err.message : err);
  }
}
